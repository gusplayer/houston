//! Provider + model resolution for a session.
//!
//! Priority: agent-level `.squad/config/config.json` → workspace entry in
//! `workspaces.json` → default Anthropic. Callers typically pass chat-level
//! overrides in front of this resolution chain.

use crate::paths::EnginePaths;
use crate::workspaces;
use serde::Deserialize;
use squad_terminal_manager::Provider;
use std::path::Path;

/// Workspace provider string that signals the Houston Credits trial — internally
/// resolves to Anthropic + Haiku with the bundled SQUAD_CREDITS_KEY env var
/// exported to the claude-code subprocess.
pub const SQUAD_CREDITS_PROVIDER: &str = "squad-credits";

/// Model used when a session runs through Houston Credits. Haiku keeps the
/// trial cost low without changing the CLI surface.
pub const SQUAD_CREDITS_MODEL: &str = "claude-haiku-4-5-20251001";

#[derive(Debug, Clone)]
pub struct ResolvedProvider {
    pub provider: Provider,
    pub model: Option<String>,
    /// True when the resolved configuration came from the `squad-credits`
    /// virtual provider. Callers should pass the bundled SQUAD_CREDITS_KEY
    /// to the session spawn so claude-code uses it instead of the user's
    /// own subscription.
    pub uses_squad_credits: bool,
}

impl Default for ResolvedProvider {
    fn default() -> Self {
        Self {
            provider: Provider::Anthropic,
            model: None,
            uses_squad_credits: false,
        }
    }
}

fn squad_credits_resolved() -> ResolvedProvider {
    ResolvedProvider {
        provider: Provider::Anthropic,
        model: Some(SQUAD_CREDITS_MODEL.to_string()),
        uses_squad_credits: true,
    }
}

#[derive(Deserialize)]
struct AgentConfig {
    #[serde(default)]
    provider: Option<String>,
    #[serde(default, alias = "claude_model")]
    model: Option<String>,
}

/// Resolve the provider + model for an agent.
///
/// Order:
/// 1. `agent_dir/.squad/config/config.json` — per-agent override.
/// 2. Workspace entry (workspace dir = parent of agent dir, workspaces root =
///    parent of workspace dir OR `paths.docs()`).
/// 3. `Provider::Anthropic`, no model (factory default).
pub fn resolve_provider(paths: &EnginePaths, agent_dir: &Path) -> ResolvedProvider {
    if let Some(from_agent) = read_agent_config(agent_dir) {
        // Agent-level config exists — but model can come from workspace if
        // the agent only overrides one field. Match the old Tauri behavior.
        if let Some(ref p_str) = from_agent.provider {
            if p_str == SQUAD_CREDITS_PROVIDER {
                return squad_credits_resolved();
            }
            if let Ok(provider) = p_str.parse::<Provider>() {
                return ResolvedProvider {
                    provider,
                    model: from_agent.model.clone(),
                    uses_squad_credits: false,
                };
            }
        }
        if from_agent.model.is_some() {
            let ws = resolve_workspace(paths, agent_dir);
            return ResolvedProvider {
                provider: ws.provider,
                model: from_agent.model,
                uses_squad_credits: ws.uses_squad_credits,
            };
        }
    }
    resolve_workspace(paths, agent_dir)
}

fn read_agent_config(agent_dir: &Path) -> Option<AgentConfig> {
    let path = agent_dir.join(".squad/config/config.json");
    let raw = std::fs::read_to_string(&path).ok()?;
    if raw.trim().is_empty() {
        return None;
    }
    serde_json::from_str(&raw).ok()
}

fn resolve_workspace(paths: &EnginePaths, agent_dir: &Path) -> ResolvedProvider {
    let Some(workspace_dir) = agent_dir.parent() else {
        return ResolvedProvider::default();
    };
    let ws_name = match workspace_dir.file_name().and_then(|n| n.to_str()) {
        Some(n) => n,
        None => return ResolvedProvider::default(),
    };
    // Workspaces root is `paths.docs()` or the workspace's parent (matches
    // adapter behavior when the agent lives under a non-standard location).
    let roots = [workspace_dir.parent(), Some(paths.docs())];
    for root in roots.iter().flatten() {
        let all = match workspaces::read_all(root) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if let Some(ws) = all.iter().find(|w| w.name == ws_name) {
            if ws.provider.as_deref() == Some(SQUAD_CREDITS_PROVIDER) {
                return squad_credits_resolved();
            }
            let provider = ws
                .provider
                .as_deref()
                .and_then(|p| p.parse::<Provider>().ok())
                .unwrap_or(Provider::Anthropic);
            return ResolvedProvider {
                provider,
                model: ws.model.clone(),
                uses_squad_credits: false,
            };
        }
    }
    ResolvedProvider::default()
}

/// Read the bundled Houston Credits Anthropic API key from the engine process
/// environment. The app passes it at engine spawn when bundled at build time.
pub fn squad_credits_key() -> Option<String> {
    std::env::var("SQUAD_CREDITS_KEY")
        .ok()
        .filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn write_json(path: &Path, body: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    #[test]
    fn default_when_no_config() {
        let d = TempDir::new().unwrap();
        let agent = d.path().join("ws").join("agent");
        std::fs::create_dir_all(&agent).unwrap();
        let paths = EnginePaths::new(d.path().to_path_buf(), d.path().to_path_buf());
        let r = resolve_provider(&paths, &agent);
        assert_eq!(r.provider, Provider::Anthropic);
        assert!(r.model.is_none());
    }

    #[test]
    fn agent_config_wins() {
        let d = TempDir::new().unwrap();
        let agent = d.path().join("ws").join("agent");
        write_json(
            &agent.join(".squad/config/config.json"),
            r#"{"provider":"openai","model":"gpt-5.5"}"#,
        );
        let paths = EnginePaths::new(d.path().to_path_buf(), d.path().to_path_buf());
        let r = resolve_provider(&paths, &agent);
        assert_eq!(r.provider, Provider::OpenAI);
        assert_eq!(r.model.as_deref(), Some("gpt-5.5"));
    }

    #[test]
    fn workspace_fallback() {
        let d = TempDir::new().unwrap();
        let workspaces_json = d.path().join("workspaces.json");
        write_json(
            &workspaces_json,
            r#"[{"id":"x","name":"ws","isDefault":true,"createdAt":"t","provider":"openai","model":"gpt-5"}]"#,
        );
        let agent = d.path().join("ws").join("agent");
        std::fs::create_dir_all(&agent).unwrap();
        let paths = EnginePaths::new(d.path().to_path_buf(), d.path().to_path_buf());
        let r = resolve_provider(&paths, &agent);
        assert_eq!(r.provider, Provider::OpenAI);
        assert_eq!(r.model.as_deref(), Some("gpt-5"));
    }

    #[test]
    fn agent_model_only_uses_workspace_provider() {
        let d = TempDir::new().unwrap();
        write_json(
            &d.path().join("workspaces.json"),
            r#"[{"id":"x","name":"ws","isDefault":true,"createdAt":"t","provider":"openai"}]"#,
        );
        let agent = d.path().join("ws").join("agent");
        write_json(
            &agent.join(".squad/config/config.json"),
            r#"{"model":"sonnet"}"#,
        );
        let paths = EnginePaths::new(d.path().to_path_buf(), d.path().to_path_buf());
        let r = resolve_provider(&paths, &agent);
        assert_eq!(r.provider, Provider::OpenAI);
        assert_eq!(r.model.as_deref(), Some("sonnet"));
    }

    #[test]
    fn squad_credits_workspace_maps_to_anthropic_haiku() {
        let d = TempDir::new().unwrap();
        write_json(
            &d.path().join("workspaces.json"),
            r#"[{"id":"x","name":"ws","isDefault":true,"createdAt":"t","provider":"squad-credits"}]"#,
        );
        let agent = d.path().join("ws").join("agent");
        std::fs::create_dir_all(&agent).unwrap();
        let paths = EnginePaths::new(d.path().to_path_buf(), d.path().to_path_buf());
        let r = resolve_provider(&paths, &agent);
        assert_eq!(r.provider, Provider::Anthropic);
        assert_eq!(r.model.as_deref(), Some(SQUAD_CREDITS_MODEL));
        assert!(r.uses_squad_credits);
    }

    #[test]
    fn squad_credits_agent_config_maps_to_anthropic_haiku() {
        let d = TempDir::new().unwrap();
        let agent = d.path().join("ws").join("agent");
        write_json(
            &agent.join(".squad/config/config.json"),
            r#"{"provider":"squad-credits"}"#,
        );
        let paths = EnginePaths::new(d.path().to_path_buf(), d.path().to_path_buf());
        let r = resolve_provider(&paths, &agent);
        assert_eq!(r.provider, Provider::Anthropic);
        assert_eq!(r.model.as_deref(), Some(SQUAD_CREDITS_MODEL));
        assert!(r.uses_squad_credits);
    }
}
