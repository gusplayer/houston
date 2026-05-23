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

use crate::state::ServerState;
use axum::{
    extract::{
        ws::{Message, WebSocket},
        Path, Query, State, WebSocketUpgrade,
    },
    response::Response,
    routing::get,
    Router,
};
use futures_util::{sink::SinkExt, stream::StreamExt};
use serde::Deserialize;
use squad_terminal_manager::{claude_install_path, PtyEvent, spawn_pty};
use std::path::PathBuf;
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new().route("/agents/:agent_path/pty", get(pty_ws))
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
fn default_cols() -> u16 { 120 }
fn default_rows() -> u16 { 36 }

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

async fn handle_pty_socket(
    socket: WebSocket,
    agent_path: String,
    query: PtyQuery,
    _state: Arc<ServerState>,
) {
    let working_dir = PathBuf::from(&agent_path);

    // Resolve claude binary path the same way as structured sessions.
    let claude_bin = if claude_install_path::is_installed() {
        claude_install_path::cli_path()
    } else {
        PathBuf::from("claude")
    };

    let handle = match spawn_pty(
        claude_bin,
        Some(working_dir),
        query.cols,
        query.rows,
    ) {
        Ok(h) => h,
        Err(e) => {
            tracing::error!("[pty] failed to spawn: {e}");
            let msg = format!("{{\"type\":\"error\",\"message\":{}}}", serde_json::json!(e));
            let mut ws = socket;
            let _ = ws.send(Message::Text(msg)).await;
            return;
        }
    };

    let (mut sink, mut stream) = socket.split();
    let write_tx = handle.write_tx.clone();
    let resize_tx = handle.resize_tx.clone();
    let mut data_rx = handle.data_rx;

    // Spawn a task to forward PTY output → WS frames.
    let pty_to_ws = tokio::spawn(async move {
        while let Some(event) = data_rx.recv().await {
            match event {
                PtyEvent::Data(bytes) => {
                    if sink.send(Message::Binary(bytes)).await.is_err() {
                        break;
                    }
                }
                PtyEvent::Exit(code) => {
                    let msg = format!("{{\"type\":\"exit\",\"code\":{code}}}");
                    let _ = sink.send(Message::Text(msg)).await;
                    break;
                }
            }
        }
    });

    // Main loop: read WS frames from client → PTY stdin or resize.
    while let Some(frame) = stream.next().await {
        match frame {
            Ok(Message::Binary(bytes)) => {
                if write_tx.send(bytes).await.is_err() {
                    break;
                }
            }
            Ok(Message::Text(txt)) => {
                if let Ok(ctrl) = serde_json::from_str::<ControlMsg>(&txt) {
                    match ctrl {
                        ControlMsg::Resize { cols, rows } => {
                            let _ = resize_tx.send((cols, rows)).await;
                        }
                    }
                }
            }
            Ok(Message::Close(_)) | Err(_) => break,
            Ok(_) => {}
        }
    }

    pty_to_ws.abort();
}
