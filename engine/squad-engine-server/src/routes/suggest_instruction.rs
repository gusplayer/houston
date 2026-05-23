//! `POST /v1/agents/suggest-instruction` — one-shot meta-analysis that
//! inspects recent conversation messages and the current CLAUDE.md to
//! suggest a single durable instruction improvement.
//!
//! Best-effort: all errors (spawn failure, timeout, parse failure) degrade
//! gracefully to `{ "suggestion": null }`. A failed suggestion is not a
//! user-visible error.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{extract::State, routing::post, Json, Router};
use serde::{Deserialize, Serialize};
use squad_engine_core::CoreError;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::time::timeout;

const SUGGEST_TIMEOUT: Duration = Duration::from_secs(30);
const MIN_MESSAGES: usize = 5;
const MAX_MESSAGES: usize = 10;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct SuggestInstructionRequest {
    pub agent_path: String,
    pub messages: Vec<ConversationMessage>,
    pub current_claude_md: String,
}

#[derive(Deserialize)]
pub struct ConversationMessage {
    pub role: String,
    pub text: String,
}

#[derive(Serialize)]
pub struct SuggestInstructionResponse {
    pub suggestion: Option<InstructionSuggestion>,
}

#[derive(Serialize, Deserialize)]
pub struct InstructionSuggestion {
    pub section_name: String,
    pub proposed_text: String,
    pub reason: String,
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn router() -> Router<Arc<ServerState>> {
    Router::new().route("/agents/suggest-instruction", post(handler))
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

pub async fn handler(
    State(_st): State<Arc<ServerState>>,
    Json(req): Json<SuggestInstructionRequest>,
) -> Result<Json<SuggestInstructionResponse>, ApiError> {
    if req.agent_path.trim().is_empty() {
        return Err(ApiError(CoreError::BadRequest(
            "agent_path is required".into(),
        )));
    }

    if req.messages.len() < MIN_MESSAGES {
        return Ok(Json(SuggestInstructionResponse { suggestion: None }));
    }

    let messages: Vec<&ConversationMessage> = req
        .messages
        .iter()
        .rev()
        .take(MAX_MESSAGES)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();

    let prompt = build_meta_prompt(&req.current_claude_md, &messages);

    let suggestion = match run_claude_suggest(&prompt).await {
        Ok(raw) => parse_suggestion(&raw),
        Err(e) => {
            tracing::warn!("[suggest-instruction] claude call failed: {e}");
            None
        }
    };

    Ok(Json(SuggestInstructionResponse { suggestion }))
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

pub fn build_meta_prompt(current_claude_md: &str, messages: &[&ConversationMessage]) -> String {
    let n = messages.len();
    let formatted = messages
        .iter()
        .map(|m| {
            let role = if m.role == "assistant" {
                "Assistant"
            } else {
                "User"
            };
            format!("{role}: {}\n", m.text)
        })
        .collect::<String>();

    let example_json = "{\"section_name\": \"## Section title\", \"proposed_text\": \"- specific rule here\", \"reason\": \"User corrected X twice\"}";

    format!(
        "You are analyzing a conversation between a user and an AI agent to improve the agent's instructions.\n\
         \n\
         Current CLAUDE.md:\n\
         <claude_md>\n\
         {current_claude_md}\n\
         </claude_md>\n\
         \n\
         Recent conversation (last {n} messages):\n\
         <conversation>\n\
         {formatted}\
         </conversation>\n\
         \n\
         Task: Identify ONE durable preference the user expressed through corrections, repeated requests, or explicit feedback. Suggest a minimal addition to the agent's CLAUDE.md.\n\
         \n\
         Rules:\n\
         - Only suggest if you have HIGH confidence this is a real, durable preference\n\
         - Suggest additions only (no deletions or rewrites)\n\
         - The proposed_text must be 1-3 bullet points max\n\
         - Return JSON only, no explanation outside JSON\n\
         \n\
         Return either:\n\
         {example_json}\n\
         \n\
         Or if no clear pattern: null"
    )
}

// ---------------------------------------------------------------------------
// Claude invocation
// ---------------------------------------------------------------------------

async fn run_claude_suggest(prompt: &str) -> Result<String, String> {
    let mut cmd = tokio::process::Command::new("claude");
    cmd.env("PATH", squad_terminal_manager::claude_path::shell_path());
    cmd.env_remove("CLAUDE_CODE_ENTRYPOINT");
    cmd.env_remove("CLAUDECODE");
    cmd.arg("-p")
        .arg("--output-format")
        .arg("text")
        .arg("--allowedTools")
        .arg("");

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

    let output = match timeout(SUGGEST_TIMEOUT, child.wait_with_output()).await {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => return Err(format!("process failed: {e}")),
        Err(_) => return Err("process timed out after 30s".to_string()),
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "claude exited {}: {}",
            output.status,
            stderr.trim()
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

// ---------------------------------------------------------------------------
// Output parser
// ---------------------------------------------------------------------------

fn parse_suggestion(raw: &str) -> Option<InstructionSuggestion> {
    let trimmed = raw.trim();
    if trimmed == "null" || trimmed.is_empty() {
        return None;
    }

    // The output might be wrapped in markdown fences; strip them if present.
    let json_str = if let Some(inner) = extract_json_from_fences(trimmed) {
        inner
    } else {
        trimmed.to_string()
    };

    serde_json::from_str::<InstructionSuggestion>(&json_str)
        .map_err(|e| {
            tracing::warn!("[suggest-instruction] JSON parse failed: {e} — raw: {json_str}");
        })
        .ok()
}

fn extract_json_from_fences(s: &str) -> Option<String> {
    // Handle ```json\n...\n``` or ```\n...\n```
    let stripped = s
        .strip_prefix("```json")
        .or_else(|| s.strip_prefix("```"))?;
    let inner = stripped.trim_start_matches('\n');
    let end = inner.rfind("```")?;
    Some(inner[..end].trim().to_string())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_msg(role: &str, text: &str) -> ConversationMessage {
        ConversationMessage {
            role: role.to_string(),
            text: text.to_string(),
        }
    }

    #[test]
    fn build_meta_prompt_includes_messages_and_md() {
        let md = "## Rules\n- Be concise";
        let msgs = vec![
            make_msg("user", "Please always reply in bullet points"),
            make_msg("assistant", "Sure, I will use bullet points"),
        ];
        let refs: Vec<&ConversationMessage> = msgs.iter().collect();
        let prompt = build_meta_prompt(md, &refs);

        assert!(prompt.contains("## Rules\n- Be concise"));
        assert!(prompt.contains("User: Please always reply in bullet points"));
        assert!(prompt.contains("Assistant: Sure, I will use bullet points"));
        assert!(prompt.contains("last 2 messages"));
    }

    #[test]
    fn build_meta_prompt_uses_correct_count() {
        let msgs = vec![
            make_msg("user", "a"),
            make_msg("assistant", "b"),
            make_msg("user", "c"),
        ];
        let refs: Vec<&ConversationMessage> = msgs.iter().collect();
        let prompt = build_meta_prompt("", &refs);
        assert!(prompt.contains("last 3 messages"));
    }

    #[test]
    fn parse_suggestion_returns_none_for_null() {
        assert!(parse_suggestion("null").is_none());
        assert!(parse_suggestion("  null  ").is_none());
        assert!(parse_suggestion("").is_none());
    }

    #[test]
    fn parse_suggestion_parses_valid_json() {
        let raw = "{\"section_name\": \"## Output\", \"proposed_text\": \"- Always use bullet points\", \"reason\": \"User asked twice\"}";
        let s = parse_suggestion(raw).unwrap();
        assert_eq!(s.section_name, "## Output");
        assert_eq!(s.proposed_text, "- Always use bullet points");
        assert_eq!(s.reason, "User asked twice");
    }

    #[test]
    fn parse_suggestion_handles_markdown_fences() {
        let raw = "```json\n{\"section_name\": \"## Style\", \"proposed_text\": \"- bullet\", \"reason\": \"reason\"}\n```";
        let s = parse_suggestion(raw).unwrap();
        assert_eq!(s.section_name, "## Style");
    }

    #[test]
    fn parse_suggestion_returns_none_for_invalid_json() {
        assert!(parse_suggestion("{not valid json}").is_none());
    }
}
