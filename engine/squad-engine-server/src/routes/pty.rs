//! `/v1/agents/{agent_path}/pty` — interactive PTY WebSocket.
//!
//! Upgrades to a raw WebSocket that drives an interactive `claude` process
//! running inside a pseudo-terminal. Each connected client gets one live PTY.
//!
//! # Protocol
//!
//! Client → server:
//! - Binary frame   — raw bytes forwarded as-is to the PTY stdin (keystrokes).
//! - Text frame     — JSON control message:
//!   `{"type":"resize","cols":N,"rows":N}` — resize the PTY window.
//!
//! Server → client:
//! - Binary frame   — raw bytes from the PTY master (ANSI terminal output).
//!   Pipe directly into an xterm.js `Terminal.write()` call.
//! - Text frame     — `{"type":"exit","code":N}` — process exited.
//!
//! Auth: same bearer-token middleware as every other `/v1/*` route.
//! Pass the token via `?token=<bearer>` or `Sec-WebSocket-Protocol:
//! squad-bearer.<token>` (browser WS cannot set `Authorization` headers).
//!
//! # Persistence
//!
//! The PTY is owned by a per-agent [`squad_terminal_manager::PtyRegistry`],
//! not by the WebSocket. Connecting **attaches** to the live session (and
//! replays its scrollback so the screen looks the same); closing the socket
//! only **detaches** — the `claude` process keeps running so the user can
//! navigate away and come back. `DELETE` on the same path is the explicit
//! "close this terminal for good" action.
//!
//! # Status events
//!
//! On attach the server emits `SessionStatus { status: "running" }` with
//! `session_key = "pty"` so the frontend sidebar can light up the running
//! glow while the interactive session is live. On `Exit` it emits
//! `status = "completed"`. The `"pty"` key never collides with structured
//! session keys (those use "activity-*", "chat-*", "routine-*" prefixes).

use crate::state::ServerState;
use axum::{
    extract::{
        ws::{Message, WebSocket},
        Path, Query, State, WebSocketUpgrade,
    },
    http::StatusCode,
    response::Response,
    routing::get,
    Router,
};
use futures_util::{sink::SinkExt, stream::StreamExt};
use serde::Deserialize;
use squad_engine_core::sessions::resolve_workspace_id;
use squad_terminal_manager::{resolve_claude_bin, Provider, PtyBroadcast};
use squad_ui_events::{EventSink, SquadEvent};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::broadcast::error::RecvError;

/// Session key used for PTY lifecycle events. Must not collide with structured
/// session keys (activity-*, chat-*, routine-*).
const PTY_SESSION_KEY: &str = "pty";

pub fn router() -> Router<Arc<ServerState>> {
    Router::new().route("/agents/:agent_path/pty", get(pty_ws).delete(pty_kill))
}

#[derive(Debug, Deserialize)]
struct PtyQuery {
    /// Initial terminal columns (default: 120).
    #[serde(default = "default_cols")]
    cols: u16,
    /// Initial terminal rows (default: 36).
    #[serde(default = "default_rows")]
    rows: u16,
    /// Chat session key whose claude conversation the terminal should
    /// continue (e.g. `chat-<agentId>`). When present and a resume id has
    /// been recorded for it, the PTY launches `claude --resume <id>` so the
    /// terminal and the structured chat are two views of one conversation.
    session_key: Option<String>,
}
fn default_cols() -> u16 {
    120
}
fn default_rows() -> u16 {
    36
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ControlMsg {
    Resize { cols: u16, rows: u16 },
}

async fn pty_ws(
    ws: WebSocketUpgrade,
    Path(agent_path): Path<String>,
    Query(query): Query<PtyQuery>,
    State(state): State<Arc<ServerState>>,
) -> Response {
    ws.on_upgrade(move |socket| handle_pty_socket(socket, agent_path, query, state))
}

/// Explicit teardown: kill the agent's PTY and forget it. This is the only
/// path that terminates a session — detaching a WebSocket never does.
async fn pty_kill(
    Path(agent_path): Path<String>,
    State(state): State<Arc<ServerState>>,
) -> StatusCode {
    state.pty_registry.kill(&agent_path);
    // Emit completed so the sidebar glow clears immediately on explicit kill.
    state.events.emit(SquadEvent::SessionStatus {
        agent_path,
        session_key: PTY_SESSION_KEY.to_string(),
        status: "completed".to_string(),
        error: None,
    });
    StatusCode::NO_CONTENT
}

async fn handle_pty_socket(
    socket: WebSocket,
    agent_path: String,
    query: PtyQuery,
    state: Arc<ServerState>,
) {
    let working_dir = PathBuf::from(&agent_path);
    let claude_bin = resolve_claude_bin();

    // Resolve the claude conversation to continue. The terminal always runs
    // `claude` (Anthropic); if the structured chat for this session_key has
    // a recorded resume id, the terminal continues that same conversation so
    // the two share context. Only used when spawning a fresh PTY.
    let resume_session_id = match query.session_key.as_deref() {
        Some(session_key) if !session_key.is_empty() => {
            let provider = Provider::Anthropic;
            let agent_key = format!("{}:{}:{}", agent_path, provider, session_key);
            let handle = state
                .engine
                .sessions
                .session_ids
                .get_for_session(&agent_key, &working_dir, session_key, provider)
                .await;
            handle.get().await
        }
        _ => None,
    };

    // Attach to the live session for this agent, spawning one if needed. The
    // PTY outlives this WebSocket — we're just one of possibly several views.
    let session = match state.pty_registry.get_or_spawn(
        &agent_path,
        claude_bin,
        working_dir.clone(),
        query.cols,
        query.rows,
        resume_session_id,
    ) {
        Ok(s) => s,
        Err(e) => {
            tracing::error!("[pty] failed to spawn: {e}");
            let msg = format!("{{\"type\":\"error\",\"message\":{}}}", serde_json::json!(e));
            let mut ws = socket;
            let _ = ws.send(Message::Text(msg)).await;
            return;
        }
    };

    // Register the agent with the transcript ingest service so its
    // Claude JSONL transcripts are polled for usage and feed data. Idempotent.
    let workspace_id = resolve_workspace_id(&state.engine.paths, &working_dir)
        .unwrap_or_default();
    state
        .engine
        .transcript_ingest
        .register_agent(
            agent_path.clone(),
            working_dir.clone(),
            workspace_id,
            query.session_key.clone(),
        )
        .await;

    // Emit "running" as soon as we attach (fresh spawn or reattach). The
    // frontend maps this to the sidebar running glow for this agent.
    state.events.emit(SquadEvent::SessionStatus {
        agent_path: agent_path.clone(),
        session_key: PTY_SESSION_KEY.to_string(),
        status: "running".to_string(),
        error: None,
    });

    // Atomically grab the scrollback snapshot + a live subscription.
    let (snapshot, mut broadcast_rx) = session.attach();
    let (mut sink, mut stream) = socket.split();

    // Replay what happened before we attached so the reopened terminal shows
    // the same screen the user left.
    if !snapshot.is_empty() && sink.send(Message::Binary(snapshot)).await.is_err() {
        return;
    }
    // Re-fit the live PTY to this client's viewport.
    let _ = session.resize(query.cols, query.rows).await;

    let events = state.events.clone();
    let agent_path_exit = agent_path.clone();

    // Forward live PTY output → WS frames.
    let pty_to_ws = tokio::spawn(async move {
        loop {
            match broadcast_rx.recv().await {
                Ok(PtyBroadcast::Data(bytes)) => {
                    if sink.send(Message::Binary((*bytes).clone())).await.is_err() {
                        break;
                    }
                }
                Ok(PtyBroadcast::Exit(code)) => {
                    let msg = format!("{{\"type\":\"exit\",\"code\":{code}}}");
                    let _ = sink.send(Message::Text(msg)).await;
                    events.emit(SquadEvent::SessionStatus {
                        agent_path: agent_path_exit,
                        session_key: PTY_SESSION_KEY.to_string(),
                        status: "completed".to_string(),
                        error: None,
                    });
                    break;
                }
                // Slow client fell behind; the next reattach replays scrollback
                // so a visual gap self-heals. Keep streaming.
                Err(RecvError::Lagged(_)) => continue,
                Err(RecvError::Closed) => break,
            }
        }
    });

    // Main loop: WS frames from client → PTY stdin or resize.
    while let Some(frame) = stream.next().await {
        match frame {
            Ok(Message::Binary(bytes)) => {
                if !session.write_bytes(bytes).await {
                    break;
                }
            }
            Ok(Message::Text(txt)) => {
                if let Ok(ControlMsg::Resize { cols, rows }) =
                    serde_json::from_str::<ControlMsg>(&txt)
                {
                    let _ = session.resize(cols, rows).await;
                }
            }
            Ok(Message::Close(_)) | Err(_) => break,
            Ok(_) => {}
        }
    }

    // Detach only: stop forwarding to this (now-gone) socket. The PTY keeps
    // running in the registry for the next reattach.
    pty_to_ws.abort();
}
