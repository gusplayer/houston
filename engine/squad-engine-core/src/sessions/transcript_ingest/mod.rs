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
use chrono::{DateTime, Utc};
use squad_db::{ChatFeedRow, Database, SessionUsageDelta};
use squad_terminal_manager::Provider;
use squad_ui_events::{DynEventSink, SquadEvent};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;
use tokio::time::{interval, Duration};

/// Board statuses for xterm cards. Mirror the structured chat lifecycle:
/// a turn runs, then waits on the user ("needs_you"). Never "completed" —
/// only the explicit Terminar action ends a terminal conversation.
const STATUS_RUNNING: &str = "running";
const STATUS_NEEDS_YOU: &str = "needs_you";
/// Terminal "done" status. Matches the board's Done column (which accepts
/// "done" / "cancelled") — NOT "completed", which lands in no column.
const STATUS_DONE: &str = "done";
/// Idle gap after which an xterm card flips from running → needs_you. Checked
/// once per poll tick (3 s), so effective latency is ~4–7 s — fine for a board.
const XTERM_IDLE: Duration = Duration::from_secs(4);

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

/// Context window (max input tokens) for a model. Anthropic models are 200k
/// by default; the 1M tier is a beta we can't detect from the model id, so we
/// report the standard window. Used only for the terminal's context bar.
fn context_window_for(_model: &str) -> u64 {
    200_000
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
    /// First-registration time in this engine run. The back-fill guard only
    /// creates board cards for sessions whose first message is newer than
    /// this, so opening a terminal in a dir with old `claude` history doesn't
    /// flood the board. Preserved across re-registrations (WS reattach).
    registered_at: DateTime<Utc>,
}

/// Board card created for an xterm-owned claude session, tracked so its status
/// can mirror the structured chat lifecycle (running ↔ needs_you).
struct XtermCard {
    working_dir: PathBuf,
    agent_path: String,
    /// Activity id, for updating the card's summarized title/description.
    activity_id: String,
    /// "activity-{uuid}" — the key `set_status_by_session_key` matches on.
    activity_session_key: String,
    /// Last status written to the board ("running" | "needs_you").
    status: &'static str,
    /// Monotonic time of the last transcript line seen for this session.
    last_line_at: Instant,
    /// Number of chat_feed rows reflected in the last title/description
    /// summary. Re-summarize only when the conversation has grown past this,
    /// so we don't burn a summary call on every idle tick.
    summarized_feed_len: usize,
}

#[derive(Default)]
struct IngestState {
    agents: HashMap<String, AgentEntry>,
    offsets: HashMap<PathBuf, u64>,
    /// Session IDs the ingest has claimed for feed writing (runner not writing).
    feed_owned: HashSet<String>,
    /// Session IDs the runner owns (already has chat_feed rows → ingest skips feed).
    runner_owned: HashSet<String>,
    /// xterm-owned sessions with a board card, keyed by claude session_id.
    xterm_cards: HashMap<String, XtermCard>,
    /// Session IDs the user has explicitly finished (Done button). Trailing
    /// transcript lines from `claude` (it can write a goodbye message between
    /// our kill request and the process actually dying) must NOT re-create a
    /// new "running" card for these — otherwise the finished card lands in
    /// Done and a phantom card pops back into Needs You a few seconds later.
    finished_xterm_sessions: HashSet<String>,
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
        // Clear xterm cards stuck on "running" from a previous engine run —
        // their liveness is tracked in memory, so nothing else flips them.
        // Skip cards this run is actively managing; their active session
        // re-promotes via `touch_xterm_activity` on its next output.
        let tracked: HashSet<String> = {
            let s = self.state.lock().await;
            s.xterm_cards
                .values()
                .filter(|c| c.agent_path == agent_path)
                .map(|c| c.activity_session_key.clone())
                .collect()
        };
        match crate::agents::activity::demote_stale_xterm_running(&working_dir, &tracked) {
            Ok(n) if n > 0 => self.events.emit(SquadEvent::ActivityChanged {
                agent_path: agent_path.clone(),
            }),
            Ok(_) => {}
            Err(e) => tracing::warn!("[transcript_ingest] demote stale running failed: {e}"),
        }

        let mut s = self.state.lock().await;
        // Preserve the original registration time across re-registrations so a
        // WS reattach doesn't retroactively reset the back-fill guard window.
        let registered_at = s
            .agents
            .get(&agent_path)
            .map(|e| e.registered_at)
            .unwrap_or_else(Utc::now);
        s.agents.insert(
            agent_path.clone(),
            AgentEntry { agent_path, working_dir, workspace_id, session_key, registered_at },
        );
    }

    /// Marks every xterm board card for `agent_path` as "done" and forgets it.
    /// Called from the explicit "Terminar"/kill action so the conversation
    /// lands in the board's Done column. A later session for the same agent
    /// starts a fresh card.
    pub async fn finish_xterm_activity(&self, agent_path: &str) {
        let finished: Vec<(PathBuf, String)> = {
            let mut s = self.state.lock().await;
            let matching: Vec<String> = s
                .xterm_cards
                .iter()
                .filter(|(_, c)| c.agent_path == agent_path)
                .map(|(sid, _)| sid.clone())
                .collect();
            // Mark these session IDs as finished BEFORE removing the cards so
            // any concurrent ingest tick that races us still sees the session
            // as "off-limits" and won't recreate a card via
            // `ensure_xterm_activity`.
            for sid in &matching {
                s.finished_xterm_sessions.insert(sid.clone());
            }
            matching
                .into_iter()
                .filter_map(|sid| {
                    s.xterm_cards
                        .remove(&sid)
                        .map(|c| (c.working_dir, c.activity_session_key))
                })
                .collect()
        };
        for (wd, sk) in finished {
            self.set_card_status(&wd, &sk, STATUS_DONE, agent_path);
        }

        // File-based fallback: catches every non-terminal card for this agent
        // — both xterm-source (whose in-memory tracking was lost across an
        // engine restart) AND chat-originated cards left in `needs_you`. The
        // user pressing Done means "wrap up this agent's work"; finishing
        // only PTY-source cards would leave the parallel chat card stuck on
        // the board and feel like Done did nothing.
        let working_dir = PathBuf::from(agent_path);
        match crate::agents::activity::finalize_all_pending(&working_dir) {
            Ok(n) if n > 0 => {
                self.events.emit(SquadEvent::ActivityChanged {
                    agent_path: agent_path.to_string(),
                });
            }
            Ok(_) => {}
            Err(e) => tracing::warn!(
                "[transcript_ingest] finalize_all_pending fallback failed for {agent_path}: {e}"
            ),
        }
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
            self.sweep_idle_xterm_cards().await;
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
            // Input-side tokens = how much context was fed to the model this
            // turn → drives the terminal's context bar.
            context_tokens: input + cw + cr,
            context_window: context_window_for(model),
        });

        // Feed items for history/mobile.
        if self.claim_feed(session_id, agent).await {
            let rows = translate_assistant_content(msg);
            self.write_feed(session_id, agent, rows).await;
            // Assistant output means the turn is still active → keep "running".
            self.touch_xterm_activity(session_id).await;
        }
    }

    async fn handle_user(&self, obj: &serde_json::Value, agent: &AgentEntry) {
        let Some(session_id) = obj["sessionId"].as_str() else { return };
        if self.claim_feed(session_id, agent).await {
            let rows = translate_user_line(obj);
            self.write_feed(session_id, agent, rows).await;
            self.ensure_xterm_activity(session_id, obj, agent).await;
            // A user line starts a fresh turn → back to "running".
            self.touch_xterm_activity(session_id).await;
        }
    }

    /// Creates an activity board card the first time a new xterm-owned session
    /// is seen. Subsequent user turns in the same session are no-ops.
    async fn ensure_xterm_activity(
        &self,
        session_id: &str,
        obj: &serde_json::Value,
        agent: &AgentEntry,
    ) {
        {
            let s = self.state.lock().await;
            if s.xterm_cards.contains_key(session_id) {
                return;
            }
            // Session was explicitly finished via Done. Trailing transcript
            // lines (`claude` can flush a final assistant or user turn between
            // our kill request and the process dying) must NOT spawn a fresh
            // "running" card — that's the phantom that lands in Needs You
            // seconds after the user pressed Done.
            if s.finished_xterm_sessions.contains(session_id) {
                return;
            }
        }

        // Back-fill guard: suppress cards for sessions whose first message
        // predates this agent's registration. Feed/usage were already written
        // above; only the board card is skipped, so opening a terminal in a
        // dir with old `claude` history doesn't flood the board.
        if is_backfilled_message(obj["timestamp"].as_str(), agent.registered_at) {
            return;
        }

        let raw_title = extract_user_text(obj)
            .unwrap_or_else(|| "Terminal session".to_string());
        let cleaned = sanitize_transcript_title(&raw_title);
        // If sanitization stripped everything (e.g. message was 100% Claude
        // Code markers like a /model command), fall back to a stable label so
        // the card never renders an empty title.
        let source = if cleaned.is_empty() {
            "Terminal session".to_string()
        } else {
            cleaned
        };
        let title: String = source.chars().take(80).collect();
        let description: String = source.chars().take(200).collect();

        let store = crate::agents::AgentStore::new(&agent.working_dir);
        let activity = match store.create_activity(crate::agents::NewActivity {
            title,
            description,
            agent: Some("xterm".to_string()),
            provider: Some("anthropic".to_string()),
            model: None,
            worktree_path: None,
        }) {
            Ok(a) => a,
            Err(e) => {
                tracing::warn!("[transcript_ingest] activity create failed for {session_id}: {e}");
                return;
            }
        };
        let Some(activity_session_key) = activity.session_key.clone() else {
            tracing::warn!("[transcript_ingest] created activity {} has no session_key", activity.id);
            return;
        };

        // Write .sid so history::load("activity-{uuid}") can find the Claude
        // session_id and load its chat_feed rows for the board history panel.
        write_sid(&agent.working_dir, &activity_session_key, session_id);

        self.events.emit(SquadEvent::ActivityChanged {
            agent_path: agent.agent_path.clone(),
        });

        self.state.lock().await.xterm_cards.insert(
            session_id.to_string(),
            XtermCard {
                working_dir: agent.working_dir.clone(),
                agent_path: agent.agent_path.clone(),
                activity_id: activity.id.clone(),
                activity_session_key,
                status: STATUS_RUNNING,
                last_line_at: Instant::now(),
                summarized_feed_len: 0,
            },
        );
    }

    /// Marks an xterm card active: refreshes its idle timer and flips it back
    /// to "running" if it had gone "needs_you". No-op for sessions without a
    /// card (runner-owned or back-fill-suppressed).
    async fn touch_xterm_activity(&self, session_id: &str) {
        let flip = {
            let mut s = self.state.lock().await;
            match s.xterm_cards.get_mut(session_id) {
                Some(card) => {
                    card.last_line_at = Instant::now();
                    if card.status == STATUS_NEEDS_YOU {
                        card.status = STATUS_RUNNING;
                        Some((
                            card.working_dir.clone(),
                            card.activity_session_key.clone(),
                            card.agent_path.clone(),
                        ))
                    } else {
                        None
                    }
                }
                None => None,
            }
        };
        if let Some((wd, sk, ap)) = flip {
            self.set_card_status(&wd, &sk, STATUS_RUNNING, &ap);
        }
    }

    /// Flips any "running" xterm card that has been idle past [`XTERM_IDLE`]
    /// to "needs_you" — Claude finished its turn and is waiting on the user.
    /// Runs once per poll tick.
    async fn sweep_idle_xterm_cards(&self) {
        let now = Instant::now();
        let mut to_flip: Vec<(PathBuf, String, String)> = Vec::new();
        // session_id of cards that just went idle — candidates for a title/
        // description refresh now that a turn has completed.
        let mut to_summarize: Vec<String> = Vec::new();
        {
            let mut s = self.state.lock().await;
            for (session_id, card) in s.xterm_cards.iter_mut() {
                if card.status == STATUS_RUNNING
                    && now.duration_since(card.last_line_at) > XTERM_IDLE
                {
                    card.status = STATUS_NEEDS_YOU;
                    to_flip.push((
                        card.working_dir.clone(),
                        card.activity_session_key.clone(),
                        card.agent_path.clone(),
                    ));
                    to_summarize.push(session_id.clone());
                }
            }
        }
        for (wd, sk, ap) in to_flip {
            self.set_card_status(&wd, &sk, STATUS_NEEDS_YOU, &ap);
        }
        for session_id in to_summarize {
            // Summary shells out to a CLI (slow); never block the poll loop.
            let this = self.clone();
            tokio::spawn(async move { this.summarize_card(&session_id).await });
        }
    }

    /// Refresh a card's title + description from a Haiku summary of the
    /// conversation so the board reads like real context ("Jeff: React Doctor
    /// test plan") instead of the raw first message. Skips work when the
    /// conversation hasn't grown since the last summary.
    async fn summarize_card(&self, session_id: &str) {
        let Some((working_dir, activity_id, agent_path, since)) = ({
            let s = self.state.lock().await;
            s.xterm_cards.get(session_id).map(|c| {
                (
                    c.working_dir.clone(),
                    c.activity_id.clone(),
                    c.agent_path.clone(),
                    c.summarized_feed_len,
                )
            })
        }) else {
            return;
        };

        let feed = self
            .db
            .list_chat_feed_by_session(session_id)
            .await
            .unwrap_or_default();
        if feed.len() <= since {
            return; // no new turns since the last summary
        }
        let convo = conversation_text(&feed);
        if convo.is_empty() {
            return;
        }

        let summary =
            crate::sessions::summarize::summarize(&convo, Provider::Anthropic, None).await;
        let summary = match summary {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!("[transcript_ingest] summary failed for {session_id}: {e}");
                return;
            }
        };

        let updated = crate::agents::activity::update(
            &working_dir,
            &activity_id,
            crate::agents::ActivityUpdate {
                title: Some(summary.title),
                description: Some(summary.description),
                ..Default::default()
            },
        );
        match updated {
            Ok(_) => {
                let mut s = self.state.lock().await;
                if let Some(card) = s.xterm_cards.get_mut(session_id) {
                    card.summarized_feed_len = feed.len();
                }
                self.events.emit(SquadEvent::ActivityChanged {
                    agent_path: agent_path.clone(),
                });
            }
            Err(e) => {
                tracing::warn!("[transcript_ingest] card summary update failed: {e}");
            }
        }
    }

    /// Write a status to the board card for `activity_session_key` and notify
    /// subscribers. A missing card (user deleted it) is ignored.
    fn set_card_status(
        &self,
        working_dir: &Path,
        activity_session_key: &str,
        status: &str,
        agent_path: &str,
    ) {
        match crate::agents::activity::set_status_by_session_key(
            working_dir,
            activity_session_key,
            status,
        ) {
            Ok(Some(_)) => {
                self.events.emit(SquadEvent::ActivityChanged {
                    agent_path: agent_path.to_string(),
                });
            }
            Ok(None) => {}
            Err(e) => {
                tracing::warn!("[transcript_ingest] xterm status flip to {status} failed: {e}");
            }
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
// Helpers
// ---------------------------------------------------------------------------

/// Strip Claude Code's transcript markup so it doesn't leak into board card
/// titles. The CLI wraps slash commands, system reminders, and local stdout
/// in XML-style tags meant for the model, never for humans. We remove the
/// tag pairs (and their inner content), HTML comments like
/// `<!--squad:skill ...-->`, then collapse whitespace.
///
/// Conservative on unknown tags: we only strip the specific Claude Code
/// markers below. Anything else passes through so user-authored XML survives.
fn sanitize_transcript_title(input: &str) -> String {
    const PAIRS: &[&str] = &[
        "local-command-caveat",
        "local-command-stdout",
        "local-command-stderr",
        "system-reminder",
        "command-name",
        "command-message",
        "command-args",
        "user-prompt-submit-hook",
    ];
    let mut text = input.to_string();
    for tag in PAIRS {
        text = strip_tag_pair(&text, tag);
    }
    text = strip_html_comments(&text);
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn strip_tag_pair(input: &str, tag: &str) -> String {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(open_idx) = rest.find(&open) {
        out.push_str(&rest[..open_idx]);
        let after_open = &rest[open_idx + open.len()..];
        match after_open.find(&close) {
            Some(close_idx) => rest = &after_open[close_idx + close.len()..],
            None => {
                // No closing tag — keep going from after the open so we don't
                // drop the rest of the input on a malformed transcript.
                rest = after_open;
            }
        }
    }
    out.push_str(rest);
    out
}

fn strip_html_comments(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(open) = rest.find("<!--") {
        out.push_str(&rest[..open]);
        let after = &rest[open + 4..];
        match after.find("-->") {
            Some(close) => rest = &after[close + 3..],
            None => rest = after,
        }
    }
    out.push_str(rest);
    out
}

/// Extract the first non-empty text string from a user JSONL message's
/// `content` field. Content may be a plain string or an array of blocks.
fn extract_user_text(obj: &serde_json::Value) -> Option<String> {
    let content = &obj["message"]["content"];
    if let Some(s) = content.as_str() {
        return if s.is_empty() { None } else { Some(s.to_string()) };
    }
    if let Some(blocks) = content.as_array() {
        for block in blocks {
            if block["type"].as_str() == Some("text") {
                if let Some(text) = block["text"].as_str() {
                    if !text.is_empty() {
                        return Some(text.to_string());
                    }
                }
            }
        }
    }
    None
}

/// Build a compact transcript for the summarizer: user + assistant text turns
/// only (tool noise dropped), capped to a few thousand chars so the title
/// prompt stays cheap. The opening turns carry the topic, so we read from the
/// start and stop once we have enough.
fn conversation_text(feed: &[ChatFeedRow]) -> String {
    const MAX_CHARS: usize = 6000;
    let mut out = String::new();
    for row in feed {
        let role = match row.feed_type.as_str() {
            "user_message" => "User",
            "assistant_text" => "Assistant",
            _ => continue,
        };
        let Ok(text) = serde_json::from_str::<String>(&row.data_json) else {
            continue;
        };
        let text = text.trim();
        if text.is_empty() {
            continue;
        }
        if !out.is_empty() {
            out.push('\n');
        }
        out.push_str(role);
        out.push_str(": ");
        out.push_str(text);
        if out.len() >= MAX_CHARS {
            break;
        }
    }
    out
}

/// Returns true if a message timestamped `timestamp` (RFC3339) predates
/// `registered_at` and should therefore NOT get a board card. A missing or
/// unparseable timestamp is treated as current (card allowed) — we'd rather
/// show a card than silently drop a live conversation.
fn is_backfilled_message(timestamp: Option<&str>, registered_at: DateTime<Utc>) -> bool {
    match timestamp.and_then(|ts| DateTime::parse_from_rfc3339(ts).ok()) {
        Some(t) => t.with_timezone(&Utc) < registered_at,
        None => false,
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

    #[test]
    fn extract_user_text_plain_string() {
        let obj = serde_json::json!({ "message": { "content": "build a login page" } });
        assert_eq!(extract_user_text(&obj).as_deref(), Some("build a login page"));
    }

    #[test]
    fn extract_user_text_first_text_block() {
        let obj = serde_json::json!({
            "message": { "content": [
                { "type": "text", "text": "first" },
                { "type": "text", "text": "second" },
            ] }
        });
        assert_eq!(extract_user_text(&obj).as_deref(), Some("first"));
    }

    #[test]
    fn extract_user_text_skips_tool_result_blocks() {
        // A turn whose only user-role content is a tool_result (no text block)
        // must not become a card title.
        let obj = serde_json::json!({
            "message": { "content": [
                { "type": "tool_result", "content": "ok", "is_error": false },
            ] }
        });
        assert_eq!(extract_user_text(&obj), None);
    }

    #[test]
    fn extract_user_text_empty_is_none() {
        let obj = serde_json::json!({ "message": { "content": "" } });
        assert_eq!(extract_user_text(&obj), None);
    }

    #[test]
    fn backfill_guard_suppresses_old_messages() {
        let registered = "2026-05-29T01:00:00Z".parse::<DateTime<Utc>>().unwrap();
        // Message a minute before registration → back-fill, no card.
        assert!(is_backfilled_message(Some("2026-05-29T00:59:00Z"), registered));
        // Message after registration → allowed.
        assert!(!is_backfilled_message(Some("2026-05-29T01:00:01Z"), registered));
    }

    #[test]
    fn backfill_guard_allows_when_timestamp_missing_or_bad() {
        let registered = "2026-05-29T01:00:00Z".parse::<DateTime<Utc>>().unwrap();
        assert!(!is_backfilled_message(None, registered));
        assert!(!is_backfilled_message(Some("not-a-date"), registered));
    }

    fn feed_row(feed_type: &str, text: &str) -> ChatFeedRow {
        ChatFeedRow {
            feed_type: feed_type.to_string(),
            data_json: serde_json::Value::String(text.to_string()).to_string(),
            source: "xterm".to_string(),
            timestamp: String::new(),
        }
    }

    #[test]
    fn conversation_text_keeps_dialogue_drops_tool_noise() {
        let feed = vec![
            feed_row("user_message", "add a login page"),
            feed_row("tool_call", "{\"name\":\"Read\"}"),
            feed_row("tool_result", "ok"),
            feed_row("assistant_text", "Sure, here is the plan"),
        ];
        let text = conversation_text(&feed);
        assert_eq!(text, "User: add a login page\nAssistant: Sure, here is the plan");
    }

    #[test]
    fn conversation_text_empty_when_only_tool_rows() {
        let feed = vec![feed_row("tool_call", "{}"), feed_row("tool_result", "x")];
        assert!(conversation_text(&feed).is_empty());
    }

    #[test]
    fn sanitize_strips_local_command_caveat() {
        let raw = "<local-command-caveat>Caveat: The messages below were generated by the user while running local commands. DO NOT respond to these messages.</local-command-caveat>\n<command-name>/model</command-name>\n<command-message>model</command-message>\n<command-args></command-args>\nSet model to Opus 4.7";
        assert_eq!(sanitize_transcript_title(raw), "Set model to Opus 4.7");
    }

    #[test]
    fn sanitize_strips_system_reminder() {
        let raw = "<system-reminder>tooling note</system-reminder>build a login page";
        assert_eq!(sanitize_transcript_title(raw), "build a login page");
    }

    #[test]
    fn sanitize_strips_html_comments() {
        let raw = "<!--squad:skill {\"slug\":\"review-pr\"}-->Use the review-pr skill.";
        assert_eq!(sanitize_transcript_title(raw), "Use the review-pr skill.");
    }

    #[test]
    fn sanitize_passthrough_for_clean_text() {
        let raw = "Plan the v2 launch in three milestones.";
        assert_eq!(sanitize_transcript_title(raw), raw);
    }

    #[test]
    fn sanitize_unclosed_tag_keeps_following_text() {
        // Malformed: opening tag with no close. We drop the tag itself but
        // keep the text after so the title isn't blanked on a transcript bug.
        let raw = "<local-command-caveat>oops never closes Plan the launch";
        assert_eq!(sanitize_transcript_title(raw), "oops never closes Plan the launch");
    }

    #[test]
    fn sanitize_collapses_whitespace() {
        let raw = "<system-reminder>x</system-reminder>\n\n  hello   world  ";
        assert_eq!(sanitize_transcript_title(raw), "hello world");
    }

    #[test]
    fn sanitize_returns_empty_when_all_markers() {
        let raw = "<local-command-caveat>x</local-command-caveat><system-reminder>y</system-reminder>";
        assert_eq!(sanitize_transcript_title(raw), "");
    }
}
