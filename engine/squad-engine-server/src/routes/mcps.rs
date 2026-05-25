//! `GET /v1/agents/mcps` and `PUT /v1/agents/mcps` — per-agent MCP server config.
//!
//! Reads/writes `<agent_dir>/.squad/mcps/mcps.json`.
//! The file is passed verbatim as `--mcp-config` to Claude Code on each session.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use squad_engine_core::agents::files::{read_agent_file, write_agent_file};
use squad_engine_core::CoreError;
use std::collections::HashMap;
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new().route("/agents/mcps", get(read_mcps).put(write_mcps))
}

#[derive(Deserialize)]
struct AgentPathQuery {
    #[serde(rename = "agentPath")]
    agent_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub args: Vec<String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub env: HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpConfig {
    pub mcp_servers: HashMap<String, McpServerConfig>,
}

impl Default for McpConfig {
    fn default() -> Self {
        Self {
            mcp_servers: HashMap::new(),
        }
    }
}

async fn read_mcps(
    State(_st): State<Arc<ServerState>>,
    Query(q): Query<AgentPathQuery>,
) -> Result<Json<McpConfig>, ApiError> {
    let agent_dir = std::path::Path::new(&q.agent_path);
    match read_agent_file(agent_dir, ".squad/mcps/mcps.json") {
        Ok(contents) if !contents.is_empty() => {
            let cfg: McpConfig = serde_json::from_str(&contents)
                .map_err(|e| CoreError::Internal(format!("mcps.json parse error: {e}")))?;
            Ok(Json(cfg))
        }
        _ => Ok(Json(McpConfig::default())),
    }
}

async fn write_mcps(
    State(st): State<Arc<ServerState>>,
    Query(q): Query<AgentPathQuery>,
    Json(body): Json<Value>,
) -> Result<(), ApiError> {
    let agent_dir = std::path::Path::new(&q.agent_path);
    let contents = serde_json::to_string_pretty(&body)
        .map_err(|e| CoreError::Internal(format!("mcps serialize: {e}")))?;
    if let Some(event) =
        write_agent_file(agent_dir, &q.agent_path, ".squad/mcps/mcps.json", &contents)?
    {
        st.engine.events.emit(event);
    }
    Ok(())
}
