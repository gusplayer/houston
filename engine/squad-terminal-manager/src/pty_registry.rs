//! Persistent PTY session registry.
//!
//! A plain `spawn_pty` call ties the `claude` REPL's lifetime to a single
//! WebSocket: navigate away in the UI and the WS closes, the read receiver
//! drops, and the child is orphaned with no way to reattach. That made the
//! terminal feel like it "forgot" what an agent was doing the moment you
//! switched agents.
//!
//! This registry keeps one live PTY **per agent path**, independent of any
//! WebSocket:
//!
//! - Output is pumped once into a capped **scrollback buffer** (so a fresh
//!   client can replay the recent screen) and fanned out over a **broadcast
//!   channel** (so the live stream reaches whichever client is attached now).
//! - Closing a WebSocket only *detaches*; the PTY keeps running.
//! - Reopening the terminal for the same agent *reattaches* to the same
//!   process and replays scrollback.
//! - Sessions are removed on process exit, or explicitly via [`PtyRegistry::kill`].
//!
//! Agents run in parallel for free: each agent path is an independent entry.

use crate::pty_session::{spawn_pty, PtyEvent, PtyKill};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::{broadcast, mpsc};

/// Max bytes of raw PTY output retained for replay on reattach. 256 KB is
/// plenty to reconstruct a screen of scrollback once xterm.js replays the
/// ANSI stream, while bounding per-session memory.
const SCROLLBACK_CAP: usize = 256 * 1024;

/// Broadcast backlog. If a client lags past this it gets a `Lagged` error
/// and we skip the dropped frames — the scrollback replay on the next
/// reattach covers any visual gap.
const BROADCAST_CAP: usize = 1024;

/// A frame fanned out to every client currently attached to a session.
#[derive(Clone, Debug)]
pub enum PtyBroadcast {
    /// Raw PTY output bytes. `Arc` so fanout to N clients is N cheap clones.
    Data(Arc<Vec<u8>>),
    /// The underlying process exited with this code.
    Exit(i32),
}

/// One persistent PTY, shared (`Arc`) by every attached client.
pub struct PtySession {
    write_tx: mpsc::Sender<Vec<u8>>,
    resize_tx: mpsc::Sender<(u16, u16)>,
    kill_tx: mpsc::Sender<PtyKill>,
    broadcast_tx: broadcast::Sender<PtyBroadcast>,
    scrollback: Mutex<Vec<u8>>,
    exited: AtomicBool,
}

impl PtySession {
    /// Atomically snapshot the current scrollback and subscribe to live
    /// output. Holding the scrollback lock across both halves is what makes
    /// the handoff race-free: the pump appends to scrollback and broadcasts
    /// under the same lock, so every byte is delivered to a new client
    /// exactly once — either in the replay snapshot or on the live stream,
    /// never both, never neither.
    pub fn attach(&self) -> (Vec<u8>, broadcast::Receiver<PtyBroadcast>) {
        let scrollback = self.scrollback.lock().unwrap();
        let snapshot = scrollback.clone();
        let rx = self.broadcast_tx.subscribe();
        (snapshot, rx)
    }

    /// Forward keystrokes to the PTY stdin. Returns false if the writer is gone.
    pub async fn write_bytes(&self, data: Vec<u8>) -> bool {
        self.write_tx.send(data).await.is_ok()
    }

    /// Resize the PTY window.
    pub async fn resize(&self, cols: u16, rows: u16) -> bool {
        self.resize_tx.send((cols, rows)).await.is_ok()
    }

    /// Whether the underlying process has exited.
    pub fn exited(&self) -> bool {
        self.exited.load(Ordering::Acquire)
    }

    fn request_kill(&self) {
        let _ = self.kill_tx.try_send(PtyKill);
    }
}

/// Append `bytes` to a scrollback buffer, trimming the oldest data so the
/// buffer never exceeds `cap`. Extracted as a free function so the trimming
/// invariant is unit-testable without a live PTY.
fn push_scrollback(buf: &mut Vec<u8>, bytes: &[u8], cap: usize) {
    buf.extend_from_slice(bytes);
    if buf.len() > cap {
        let overflow = buf.len() - cap;
        buf.drain(0..overflow);
    }
}

/// Per-agent registry of persistent PTY sessions. Cheap to clone (`Arc`
/// inside); store one in the server state.
#[derive(Clone, Default)]
pub struct PtyRegistry {
    sessions: Arc<Mutex<HashMap<String, Arc<PtySession>>>>,
}

impl PtyRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Return the live session for `agent_path`, spawning a fresh PTY if
    /// none exists or the previous one already exited.
    ///
    /// `resume_session_id` is only consulted when a fresh PTY is spawned — an
    /// already-running session is reused as-is (it's mid-conversation). When
    /// set, the new `claude` continues that conversation, so chat and
    /// terminal share one context.
    pub fn get_or_spawn(
        &self,
        agent_path: &str,
        claude_bin: PathBuf,
        working_dir: PathBuf,
        cols: u16,
        rows: u16,
        resume_session_id: Option<String>,
        api_key_override: Option<String>,
        model: Option<String>,
    ) -> Result<Arc<PtySession>, String> {
        {
            let map = self.sessions.lock().unwrap();
            if let Some(existing) = map.get(agent_path) {
                if !existing.exited() {
                    return Ok(existing.clone());
                }
            }
        }

        let handle = spawn_pty(
            claude_bin,
            Some(working_dir),
            cols,
            rows,
            resume_session_id,
            api_key_override,
            model,
        )?;
        let parts = handle.into_parts();
        let (broadcast_tx, _keep) = broadcast::channel(BROADCAST_CAP);
        let session = Arc::new(PtySession {
            write_tx: parts.write_tx,
            resize_tx: parts.resize_tx,
            kill_tx: parts.kill_tx,
            broadcast_tx,
            scrollback: Mutex::new(Vec::new()),
            exited: AtomicBool::new(false),
        });

        // Pump: single owner of `data_rx`, fanning output into scrollback +
        // broadcast and self-removing from the registry on exit.
        tokio::spawn(pump(
            parts.data_rx,
            session.clone(),
            agent_path.to_string(),
            self.sessions.clone(),
        ));

        let mut map = self.sessions.lock().unwrap();
        // Double-check: another task may have spawned concurrently between
        // our release above and this re-lock. Last writer wins; the loser's
        // PTY pump will idle and get cleaned up when its child exits.
        let entry = map.entry(agent_path.to_string()).or_insert_with(|| session.clone());
        Ok(entry.clone())
    }

    /// Explicitly terminate and forget the session for `agent_path`. This is
    /// the *only* path that kills a PTY — detaching a WebSocket never does.
    pub fn kill(&self, agent_path: &str) {
        let session = self.sessions.lock().unwrap().remove(agent_path);
        if let Some(session) = session {
            session.request_kill();
        }
    }
}

async fn pump(
    mut data_rx: mpsc::Receiver<PtyEvent>,
    session: Arc<PtySession>,
    agent_path: String,
    sessions: Arc<Mutex<HashMap<String, Arc<PtySession>>>>,
) {
    while let Some(event) = data_rx.recv().await {
        match event {
            PtyEvent::Data(bytes) => {
                // Append to scrollback and broadcast under the SAME lock so
                // `attach()` sees a consistent snapshot/subscribe boundary.
                let mut scrollback = session.scrollback.lock().unwrap();
                push_scrollback(&mut scrollback, &bytes, SCROLLBACK_CAP);
                let _ = session.broadcast_tx.send(PtyBroadcast::Data(Arc::new(bytes)));
            }
            PtyEvent::Exit(code) => {
                session.exited.store(true, Ordering::Release);
                let _ = session.broadcast_tx.send(PtyBroadcast::Exit(code));
                sessions.lock().unwrap().remove(&agent_path);
                return;
            }
        }
    }
    // Channel closed without an explicit Exit (reader thread ended). Treat as
    // terminated so a later get_or_spawn starts fresh instead of handing back
    // a dead session.
    session.exited.store(true, Ordering::Release);
    sessions.lock().unwrap().remove(&agent_path);
}

/// Resolve the `claude` binary for the interactive PTY.
///
/// For the PTY we prefer the user's own `claude` (the one they authenticated
/// with via `claude auth login` in their terminal) over Squad's bundled copy
/// — different binaries can't share macOS Keychain credentials, so the
/// bundled copy would show a first-run "Welcome to Claude Code" screen even
/// though the user is fully signed in. Falls back to the bundled install,
/// then to a bare `claude` on PATH when nothing else is available.
pub fn resolve_claude_bin() -> PathBuf {
    let bundled = if crate::claude_install_path::is_installed() {
        Some(crate::claude_install_path::cli_path())
    } else {
        None
    };
    if let Some(user_bin) =
        crate::claude_path::user_shell_binary_excluding("claude", bundled.as_deref())
    {
        return user_bin;
    }
    bundled.unwrap_or_else(|| PathBuf::from("claude"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scrollback_appends_below_cap() {
        let mut buf = Vec::new();
        push_scrollback(&mut buf, b"hello", 32);
        push_scrollback(&mut buf, b" world", 32);
        assert_eq!(buf, b"hello world");
    }

    #[test]
    fn scrollback_trims_oldest_past_cap() {
        let mut buf = Vec::new();
        push_scrollback(&mut buf, b"0123456789", 8);
        // Keeps only the most recent 8 bytes.
        assert_eq!(buf, b"23456789");
    }

    #[test]
    fn scrollback_trims_across_multiple_pushes() {
        let mut buf = Vec::new();
        push_scrollback(&mut buf, b"aaaa", 6);
        push_scrollback(&mut buf, b"bbbb", 6);
        assert_eq!(buf.len(), 6);
        assert_eq!(buf, b"aabbbb");
    }

    #[tokio::test]
    async fn attach_replays_scrollback_and_streams_live() {
        // Build a session by hand (no real PTY) to exercise the attach +
        // broadcast contract directly.
        let (write_tx, _wr) = mpsc::channel(4);
        let (resize_tx, _rr) = mpsc::channel(4);
        let (kill_tx, _kr) = mpsc::channel(4);
        let (broadcast_tx, _keep) = broadcast::channel(16);
        let session = Arc::new(PtySession {
            write_tx,
            resize_tx,
            kill_tx,
            broadcast_tx: broadcast_tx.clone(),
            scrollback: Mutex::new(b"history".to_vec()),
            exited: AtomicBool::new(false),
        });

        let (snapshot, mut rx) = session.attach();
        assert_eq!(snapshot, b"history");

        // A live frame after attach should reach the subscriber and NOT be
        // part of the replayed snapshot.
        broadcast_tx
            .send(PtyBroadcast::Data(Arc::new(b"-live".to_vec())))
            .unwrap();
        match rx.recv().await.unwrap() {
            PtyBroadcast::Data(bytes) => assert_eq!(&*bytes, b"-live"),
            PtyBroadcast::Exit(_) => panic!("unexpected exit"),
        }
    }
}
