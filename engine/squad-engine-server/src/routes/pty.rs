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
use squad_terminal_manager::{resolve_claude_bin, PtyBroadcast};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::broadcast::error::RecvError;

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

    // Attach to the live session for this agent, spawning one if needed. The
    // PTY outlives this WebSocket — we're just one of possibly several views.
    let session = match state.pty_registry.get_or_spawn(
        &agent_path,
        claude_bin,
        working_dir,
        query.cols,
        query.rows,
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
