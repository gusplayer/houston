//! Derives session usage and chat feed from Claude Code JSONL transcripts.
//!
//! One background task (3 s poll) tails `~/.claude/projects/<cwd>/*.jsonl`
//! for every registered agent. Each `assistant` line → usage upsert +
//! `SessionUsageChanged`. `user` / `assistant` content → `chat_feed` rows +
//! `FeedItem` WS events so desktop history and mobile mirror xterm turns.
//!
//! Feed ownership is determined lazily: if `chat_feed` already has rows for a
//! `sessionId` (written by the headless runner), the ingest skips feed
//! writing for that session (usage still recorded). This prevents duplicate
//! entries for routine / mobile-send sessions.

pub mod feed;

use feed::{translate_assistant_content, translate_user_line, write_sid};
use squad_db::{Database, SessionUsageDelta};
use squad_ui_events::{DynEventSink, SquadEvent};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{interval, Duration};

// ---------------------------------------------------------------------------
// Path helpers (pub so PTY route / tests can verify encoding)
// ---------------------------------------------------------------------------

pub fn encode_cwd(path: &Path) -> String {
    path.to_string_lossy()
        .replace('/', "-")
        .replace('.', "-")
        .replace(' ', "-")
}

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

fn compute_cost(model: &str, input: u64, output: u64, cw: u64, cr: u64) -> f64 {
    let (ip, op, cwp, crp): (f64, f64, f64, f64) = if model.contains("opus") {
        (15.0, 75.0, 18.75, 1.50)
    } else if model.contains("haiku") {
        (0.80, 4.0, 1.0, 0.08)
    } else {
        (3.0, 15.0, 3.75, 0.30)
    };
    let m = |t: u64, p: f64| (t as f64 / 1_000_000.0) * p;
    m(input, ip) + m(output, op) + m(cw, cwp) + m(cr, crp)
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct AgentEntry {
    agent_path: String,
    working_dir: PathBuf,
    workspace_id: String,
    /// Squad session key used for FeedItem events and .sid updates.
    /// Populated when registered from the PTY route.
    session_key: Option<String>,
}

#[derive(Default)]
struct IngestState {
    agents: HashMap<String, AgentEntry>,
    offsets: HashMap<PathBuf, u64>,
    /// Session IDs the ingest has claimed for feed writing (runner not writing).
    feed_owned: HashSet<String>,
    /// Session IDs the runner owns (already has chat_feed rows → ingest skips feed).
    runner_owned: HashSet<String>,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct TranscriptIngest {
    state: Arc<Mutex<IngestState>>,
    db: Database,
    events: DynEventSink,
}

impl TranscriptIngest {
    pub fn new(db: Database, events: DynEventSink) -> Self {
        Self { state: Arc::new(Mutex::new(IngestState::default())), db, events }
    }

    pub fn start(&self) {
        let this = self.clone();
        tokio::spawn(async move { this.run().await });
    }

    pub async fn register_agent(
        &self,
        agent_path: String,
        working_dir: PathBuf,
        workspace_id: String,
        session_key: Option<String>,
    ) {
        let mut s = self.state.lock().await;
        s.agents.insert(
            agent_path.clone(),
            AgentEntry { agent_path, working_dir, workspace_id, session_key },
        );
    }

    // -----------------------------------------------------------------------
    // Loop
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
        if content.len() as u64 <= offset { return; }
        let new_bytes = &content[offset as usize..];
        let Some(last_nl) = new_bytes.iter().rposition(|&b| b == b'\n') else { return };
        let new_offset = offset + last_nl as u64 + 1;
        let Ok(text) = std::str::from_utf8(&new_bytes[..=last_nl]) else { return };

        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() { continue; }
            let Ok(obj) = serde_json::from_str::<serde_json::Value>(line) else { continue };
            match obj["type"].as_str() {
                Some("assistant") => self.handle_assistant(&obj, agent).await,
                Some("user") => self.handle_user(&obj, agent).await,
                _ => {}
            }
        }
        self.state.lock().await.offsets.insert(path, new_offset);
    }

    // -----------------------------------------------------------------------
    // Line handlers
    // -----------------------------------------------------------------------

    async fn handle_assistant(&self, obj: &serde_json::Value, agent: &AgentEntry) {
        if agent.workspace_id.is_empty() { return; }
        let msg = &obj["message"];
        let Some(usage) = msg.get("usage") else { return };
        let Some(session_id) = obj["sessionId"].as_str() else { return };
        let input = usage["input_tokens"].as_u64().unwrap_or(0);
        let output = usage["output_tokens"].as_u64().unwrap_or(0);
        let cw = usage["cache_creation_input_tokens"].as_u64().unwrap_or(0);
        let cr = usage["cache_read_input_tokens"].as_u64().unwrap_or(0);
        let model = msg["model"].as_str().unwrap_or("claude-sonnet");

        let delta = SessionUsageDelta {
            session_key: session_id,
            provider: "anthropic",
            agent_path: &agent.agent_path,
            workspace_id: &agent.workspace_id,
            input_tokens: input,
            output_tokens: output,
            cache_creation_input_tokens: cw,
            cache_read_input_tokens: cr,
            cost_usd: compute_cost(model, input, output, cw, cr),
            model: Some(model),
        };
        if let Err(e) = self.db.upsert_session_usage(delta).await {
            tracing::warn!("[transcript_ingest] usage upsert failed {session_id}: {e}");
            return;
        }
        self.events.emit(SquadEvent::SessionUsageChanged {
            workspace_id: agent.workspace_id.clone(),
            agent_path: agent.agent_path.clone(),
            session_key: session_id.to_string(),
            provider: "anthropic".to_string(),
        });

        // Feed items for history/mobile.
        if self.claim_feed(session_id, agent).await {
            let rows = translate_assistant_content(msg);
            self.write_feed(session_id, agent, rows).await;
        }
    }

    async fn handle_user(&self, obj: &serde_json::Value, agent: &AgentEntry) {
        let Some(session_id) = obj["sessionId"].as_str() else { return };
        if self.claim_feed(session_id, agent).await {
            let rows = translate_user_line(obj);
            self.write_feed(session_id, agent, rows).await;
        }
    }

    /// Returns `true` if the ingest owns feed writing for this session.
    /// On first encounter: checks `chat_feed`; empty → claim + write .sid.
    async fn claim_feed(&self, session_id: &str, agent: &AgentEntry) -> bool {
        {
            let s = self.state.lock().await;
            if s.feed_owned.contains(session_id) { return true; }
            if s.runner_owned.contains(session_id) { return false; }
        }
        // First time seeing this session_id — check the DB.
        let existing = self.db.list_chat_feed_by_session(session_id).await
            .map(|r| !r.is_empty())
            .unwrap_or(false);
        let mut s = self.state.lock().await;
        if existing {
            s.runner_owned.insert(session_id.to_string());
            false
        } else {
            s.feed_owned.insert(session_id.to_string());
            // Update .sid so history::load can find this session via session_key.
            if let (Some(sk), wd) = (&agent.session_key, &agent.working_dir) {
                write_sid(wd, sk, session_id);
            }
            true
        }
    }

    async fn write_feed(&self, session_id: &str, agent: &AgentEntry, rows: Vec<feed::FeedRow>) {
        let session_key = agent.session_key.as_deref().unwrap_or(session_id);
        for row in rows {
            if let Err(e) = self.db.add_chat_feed_item_by_session(
                session_id, &row.feed_type, &row.data_json, "xterm",
            ).await {
                tracing::warn!("[transcript_ingest] feed write failed: {e}");
                continue;
            }
            if let Some(item) = row.item {
                self.events.emit(SquadEvent::FeedItem {
                    agent_path: agent.agent_path.clone(),
                    session_key: session_key.to_string(),
                    item,
                });
            }
        }
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
    fn encode_cwd_replaces_spaces() {
        assert_eq!(
            encode_cwd(Path::new("/Users/foo/.dev-houston/workspaces/workspace 3/Steve")),
            "-Users-foo--dev-houston-workspaces-workspace-3-Steve"
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
