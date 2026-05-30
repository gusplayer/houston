//! `/v1/library/*` — user-owned library of skills/roles/MCPs.
//!
//! Three operations:
//! - `POST /v1/library/install-from-url`  — fetch GitHub URL, detect kind, install
//! - `GET  /v1/library/:kind`             — list installed items of a kind
//! - `POST /v1/library/:kind/:slug/copy-to-agent` — copy a skill into an agent root
//!
//! Skills are the only kind that supports `copy-to-agent` in M1; role + MCP
//! copy paths return BadRequest until M2/M4 wire them.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{
    extract::{Path as AxumPath, State},
    routing::{get, post},
    Json, Router,
};
use squad_engine_core::library::{
    self, CopyToAgentRequest, CopyToAgentResponse, InstallFromUrlRequest, InstallFromUrlResponse,
    LibraryItem, LibraryKind,
};
use std::path::PathBuf;
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route("/library/install-from-url", post(install_from_url))
        .route("/library/:kind", get(list_kind))
        .route(
            "/library/:kind/:slug/copy-to-agent",
            post(copy_to_agent),
        )
}

async fn install_from_url(
    State(st): State<Arc<ServerState>>,
    Json(req): Json<InstallFromUrlRequest>,
) -> Result<Json<InstallFromUrlResponse>, ApiError> {
    let home = st.engine.paths.home();
    let resp = library::install_from_url(home, &req.url).await?;
    Ok(Json(resp))
}

async fn list_kind(
    State(st): State<Arc<ServerState>>,
    AxumPath(kind): AxumPath<String>,
) -> Result<Json<Vec<LibraryItem>>, ApiError> {
    let kind = LibraryKind::parse(&kind)?;
    let home = st.engine.paths.home();
    Ok(Json(library::list_kind(home, kind)?))
}

async fn copy_to_agent(
    State(st): State<Arc<ServerState>>,
    AxumPath((kind, slug)): AxumPath<(String, String)>,
    Json(req): Json<CopyToAgentRequest>,
) -> Result<Json<CopyToAgentResponse>, ApiError> {
    let kind = LibraryKind::parse(&kind)?;
    let home = st.engine.paths.home();
    let agent_root = PathBuf::from(&req.agent_path);
    let target_path = library::copy_to_agent(home, kind, &slug, &agent_root)?;
    Ok(Json(CopyToAgentResponse { target_path }))
}
