//! Derives session usage from Claude Code's on-disk JSONL transcripts.
//!
//! Claude Code writes a `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`
//! file for every conversation, regardless of how it was invoked (interactive
//! REPL, `--print`, or `--resume`). Each `assistant` line carries a full
//! `message.usage` object with input/output/cache token counts. This module
//! tails those files and upserts into `session_usage` — making the dashboard
//! reflect xterm sessions that the structured session_runner never sees.
//!
//! One background task polls every 3 seconds across all registered agents.
//! Only complete lines (ending with `\n`) are consumed; the byte offset
//! advances to the end of the last complete line so partial lines at the
//! write frontier are never mistaken for valid JSON.

use squad_db::{Database, SessionUsageDelta};
use squad_ui_events::{DynEventSink, SquadEvent};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{interval, Duration};

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/// Claude Code encodes the CWD as the project dir name by replacing every
/// `/` and `.` with `-`. The leading `/` becomes a leading `-`.
pub fn encode_cwd(path: &Path) -> String {
    path.to_string_lossy()
        .replace('/', "-")
        .replace('.', "-")
}

/// Absolute path to the Claude Code transcript dir for `working_dir`.
/// Returns `None` if the home dir cannot be determined.
pub fn transcript_dir(working_dir: &Path) -> Option<PathBuf> {
    dirs::home_dir().map(|h| {
        h.join(".claude")
            .join("projects")
            .join(encode_cwd(working_dir))
    })
}

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

fn compute_cost(model: &str, input: u64, output: u64, cache_write: u64, cache_read: u64) -> f64 {
    // Approximate per-million token prices (USD) by model family.
    let (ip, op, cwp, crp): (f64, f64, f64, f64) = if model.contains("opus") {
        (15.0, 75.0, 18.75, 1.50)
    } else if model.contains("haiku") {
        (0.80, 4.0, 1.0, 0.08)
    } else {
        (3.0, 15.0, 3.75, 0.30) // sonnet / default
    };
    let per_m = |t: u64, p: f64| (t as f64 / 1_000_000.0) * p;
    per_m(input, ip) + per_m(output, op) + per_m(cache_write, cwp) + per_m(cache_read, crp)
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct AgentEntry {
    agent_path: String,
    working_dir: PathBuf,
    workspace_id: String,
}

#[derive(Default)]
struct IngestState {
    /// Registered agents to watch. Keyed by agent_path; registration is
    /// idempotent so repeated PTY attaches don't add duplicates.
    agents: HashMap<String, AgentEntry>,
    /// Byte offset per JSONL file — tracks how far we've read each transcript
    /// so we never re-process the same lines.
    offsets: HashMap<PathBuf, u64>,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Cheap to clone (wraps an `Arc`). Add to `EngineState` and wire to PTY /
/// session routes so every active agent's transcripts are polled.
#[derive(Clone)]
pub struct TranscriptIngest {
    state: Arc<Mutex<IngestState>>,
    db: Database,
    events: DynEventSink,
}

impl TranscriptIngest {
    pub fn new(db: Database, events: DynEventSink) -> Self {
        Self {
            state: Arc::new(Mutex::new(IngestState::default())),
            db,
            events,
        }
    }

    /// Start the background polling loop. Must be called once after the tokio
    /// runtime is running (i.e. from an async context).
    pub fn start(&self) {
        let this = self.clone();
        tokio::spawn(async move { this.run().await });
    }

    /// Register an agent so its transcript dir is included in the poll loop.
    /// Idempotent: safe to call on every PTY attach.
    pub async fn register_agent(
        &self,
        agent_path: String,
        working_dir: PathBuf,
        workspace_id: String,
    ) {
        let mut s = self.state.lock().await;
        s.agents.insert(
            agent_path.clone(),
            AgentEntry { agent_path, working_dir, workspace_id },
        );
    }

    // -----------------------------------------------------------------------
    // Internal loop
    // -----------------------------------------------------------------------

    async fn run(&self) {
        let mut ticker = interval(Duration::from_secs(3));
        loop {
            ticker.tick().await;
            let agents = {
                let s = self.state.lock().await;
                s.agents.values().cloned().collect::<Vec<_>>()
            };
            for agent in agents {
                self.poll_agent(&agent).await;
            }
        }
    }

    async fn poll_agent(&self, agent: &AgentEntry) {
        let Some(dir) = transcript_dir(&agent.working_dir) else { return };
        let Ok(mut rd) = tokio::fs::read_dir(&dir).await else { return };
        while let Ok(Some(entry)) = rd.next_entry().await {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            self.process_file(path, agent).await;
        }
    }

    async fn process_file(&self, path: PathBuf, agent: &AgentEntry) {
        let offset = {
            let s = self.state.lock().await;
            *s.offsets.get(&path).unwrap_or(&0)
        };
        let Ok(content) = tokio::fs::read(&path).await else { return };
        if content.len() as u64 <= offset {
            return;
        }
        let new_bytes = &content[offset as usize..];
        // Only consume up to the last complete line (ends with '\n').
        let Some(last_nl) = new_bytes.iter().rposition(|&b| b == b'\n') else { return };
        let process_bytes = &new_bytes[..=last_nl];
        let new_offset = offset + last_nl as u64 + 1;

        let Ok(text) = std::str::from_utf8(process_bytes) else { return };
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            if let Ok(obj) = serde_json::from_str::<serde_json::Value>(line) {
                if obj["type"].as_str() == Some("assistant") {
                    self.ingest_assistant(&obj, agent).await;
                }
            }
        }
        self.state.lock().await.offsets.insert(path, new_offset);
    }

    async fn ingest_assistant(&self, obj: &serde_json::Value, agent: &AgentEntry) {
        if agent.workspace_id.is_empty() {
            return;
        }
        let msg = &obj["message"];
        let Some(usage) = msg.get("usage") else { return };
        let Some(session_id) = obj["sessionId"].as_str() else { return };
        let input = usage["input_tokens"].as_u64().unwrap_or(0);
        let output = usage["output_tokens"].as_u64().unwrap_or(0);
        let cw = usage["cache_creation_input_tokens"].as_u64().unwrap_or(0);
        let cr = usage["cache_read_input_tokens"].as_u64().unwrap_or(0);
        let model = msg["model"].as_str().unwrap_or("claude-sonnet");
        let cost = compute_cost(model, input, output, cw, cr);

        let delta = SessionUsageDelta {
            session_key: session_id,
            provider: "anthropic",
            agent_path: &agent.agent_path,
            workspace_id: &agent.workspace_id,
            input_tokens: input,
            output_tokens: output,
            cache_creation_input_tokens: cw,
            cache_read_input_tokens: cr,
            cost_usd: cost,
            model: Some(model),
        };
        if let Err(e) = self.db.upsert_session_usage(delta).await {
            tracing::warn!("[transcript_ingest] upsert failed for {session_id}: {e}");
            return;
        }
        self.events.emit(SquadEvent::SessionUsageChanged {
            workspace_id: agent.workspace_id.clone(),
            agent_path: agent.agent_path.clone(),
            session_key: session_id.to_string(),
            provider: "anthropic".to_string(),
        });
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_cwd_replaces_slash_and_dot() {
        assert_eq!(
            encode_cwd(Path::new("/Users/foo/.squad/workspaces/ws/Alex")),
            "-Users-foo--squad-workspaces-ws-Alex"
        );
    }

    #[test]
    fn compute_cost_opus() {
        let c = compute_cost("claude-opus-4", 1_000_000, 0, 0, 0);
        assert!((c - 15.0).abs() < 0.001);
    }

    #[test]
    fn compute_cost_sonnet_default() {
        let c = compute_cost("claude-sonnet-3-5", 1_000_000, 0, 0, 0);
        assert!((c - 3.0).abs() < 0.001);
    }
}
