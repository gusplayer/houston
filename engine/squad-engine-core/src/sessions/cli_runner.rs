//! Shared "shell out to a provider CLI with a prompt on stdin" helper.
//!
//! Used by [`super::spec_writer`] and [`super::tests_writer`] (and any future
//! one-shot generator) so the claude / codex spawn logic, env scrubbing,
//! timeout handling, and codex JSON-event parsing live in one place.

use squad_terminal_manager::{claude_path, Provider};
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::time::timeout;

const CLAUDE_DEFAULT_MODEL: &str = "sonnet";
const CODEX_DEFAULT_MODEL: &str = "gpt-5.5";

/// Run `prompt` through the configured provider's CLI and return its trimmed
/// stdout. `cli_timeout` bounds the call so a stuck process never blocks a
/// caller indefinitely.
pub async fn run_provider(
    prompt: &str,
    provider: Provider,
    model: Option<&str>,
    cli_timeout: Duration,
) -> Result<String, String> {
    match provider {
        Provider::Anthropic => run_claude(prompt, model, cli_timeout).await,
        Provider::OpenAI => run_codex(prompt, model, cli_timeout).await,
    }
}

async fn run_claude(
    prompt: &str,
    model: Option<&str>,
    cli_timeout: Duration,
) -> Result<String, String> {
    let bin = resolve_claude_for_cli();
    let mut cmd = Command::new(&bin);
    cmd.env("PATH", claude_path::shell_path());
    cmd.env_remove("CLAUDE_CODE_ENTRYPOINT");
    cmd.env_remove("CLAUDECODE");
    cmd.arg("-p")
        .arg("--model")
        .arg(model.unwrap_or(CLAUDE_DEFAULT_MODEL))
        .arg("--output-format")
        .arg("text")
        .arg("--allowedTools")
        .arg("");
    run_with_prompt(cmd, prompt, cli_timeout).await
}

/// Pick the `claude` binary, preferring the user's authenticated install over
/// Squad's bundled copy. See [`squad_terminal_manager::pty_registry::resolve_claude_bin`]
/// for why this matters (Keychain ACL).
fn resolve_claude_for_cli() -> std::path::PathBuf {
    use squad_terminal_manager::claude_install_path;
    let bundled = if claude_install_path::is_installed() {
        Some(claude_install_path::cli_path())
    } else {
        None
    };
    if let Some(user_bin) = claude_path::user_shell_binary_excluding("claude", bundled.as_deref()) {
        return user_bin;
    }
    bundled.unwrap_or_else(|| std::path::PathBuf::from("claude"))
}

async fn run_codex(
    prompt: &str,
    model: Option<&str>,
    cli_timeout: Duration,
) -> Result<String, String> {
    // Same Keychain story as claude — prefer the user's authenticated `codex`
    // (Homebrew / npm-installed) over Squad's bundled copy. The bundled one
    // only wins when the user doesn't have codex installed system-wide.
    let bundled = squad_cli_bundle::bundled_codex_path();
    let bin = claude_path::user_shell_binary_excluding("codex", bundled.as_deref())
        .or(bundled)
        .unwrap_or_else(|| std::path::PathBuf::from("codex"));
    let mut cmd = Command::new(&bin);
    cmd.env("PATH", claude_path::shell_path());
    cmd.arg("exec")
        .arg("--json")
        .arg("--dangerously-bypass-approvals-and-sandbox")
        .arg("--skip-git-repo-check")
        .arg("-c")
        .arg("model_reasoning_effort=\"low\"")
        .arg("--model")
        .arg(model.unwrap_or(CODEX_DEFAULT_MODEL))
        .arg("-");
    let stdout = run_with_prompt(cmd, prompt, cli_timeout).await?;
    extract_codex_text(&stdout)
}

async fn run_with_prompt(
    mut cmd: Command,
    prompt: &str,
    cli_timeout: Duration,
) -> Result<String, String> {
    cmd.kill_on_drop(true);
    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("spawn failed: {e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(prompt.as_bytes())
            .await
            .map_err(|e| format!("stdin write failed: {e}"))?;
        drop(stdin);
    }
    let output = match timeout(cli_timeout, child.wait_with_output()).await {
        Ok(Ok(o)) => o,
        Ok(Err(e)) => return Err(format!("process failed: {e}")),
        Err(_) => return Err("process timed out".to_string()),
    };
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("process exited {}: {}", output.status, stderr.trim()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Codex emits a JSON event stream; the spec/tests body lives in the
/// LAST `agent_message` item's `text` field.
fn extract_codex_text(stdout: &str) -> Result<String, String> {
    let mut latest = String::new();
    for line in stdout.lines() {
        let Ok(event) = serde_json::from_str::<serde_json::Value>(line.trim()) else {
            continue;
        };
        let Some(item) = event.get("item") else { continue };
        if item.get("type").and_then(|v| v.as_str()) == Some("agent_message") {
            if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
                latest = text.to_string();
            }
        }
    }
    if latest.trim().is_empty() {
        Err("codex output had no agent_message text".to_string())
    } else {
        Ok(latest)
    }
}

/// Strip a leading ```markdown / ```md / ``` fence and the matching trailing
/// ``` so the file on disk is pure markdown even if the CLI wraps its output.
pub fn strip_code_fences(s: &str) -> &str {
    let trimmed = s.trim();
    let without_open = trimmed
        .strip_prefix("```markdown\n")
        .or_else(|| trimmed.strip_prefix("```md\n"))
        .or_else(|| trimmed.strip_prefix("```\n"))
        .unwrap_or(trimmed);
    without_open.strip_suffix("\n```").unwrap_or(without_open)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_code_fences_removes_markdown_wrap() {
        let wrapped = "```markdown\n# Spec\n\n## Objective\n...\n```";
        assert_eq!(strip_code_fences(wrapped), "# Spec\n\n## Objective\n...");
    }

    #[test]
    fn strip_code_fences_handles_bare_triple_backticks() {
        let wrapped = "```\n# Spec\n```";
        assert_eq!(strip_code_fences(wrapped), "# Spec");
    }

    #[test]
    fn strip_code_fences_leaves_plain_markdown() {
        let plain = "# Spec\n\n## Objective\n...";
        assert_eq!(strip_code_fences(plain), plain);
    }

    #[test]
    fn extract_codex_text_picks_last_agent_message() {
        // Hash level 2 because the JSON content contains `"#` inline.
        let raw = r##"{"type":"thread.started","thread_id":"t1"}
{"type":"item.completed","item":{"type":"agent_message","text":"# Spec: A\n..."}}
{"type":"item.completed","item":{"type":"agent_message","text":"# Spec: B\n..."}}"##;
        assert_eq!(extract_codex_text(raw).unwrap(), "# Spec: B\n...");
    }

    #[test]
    fn extract_codex_text_errors_when_no_agent_message() {
        let raw = r##"{"type":"thread.started","thread_id":"t1"}"##;
        assert!(extract_codex_text(raw).is_err());
    }
}
