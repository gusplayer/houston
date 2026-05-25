//! `/v1/workspaces/:wid/methodology` REST routes + manual seed for a project.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use squad_engine_core::methodology::{self, MethodologyConfig};
use squad_engine_core::{workspaces, CoreError};
use squad_ui_events::SquadEvent;
use std::path::PathBuf;
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route("/workspaces/:wid/methodology", get(read).put(write))
        .route("/workspaces/:wid/methodology/status", get(status))
        .route(
            "/workspaces/:wid/projects/:pid/methodology/seed",
            post(seed),
        )
}

fn workspace_dir(docs: &std::path::Path, wid: &str) -> Result<PathBuf, ApiError> {
    let all = workspaces::read_all(docs)?;
    let ws = all
        .into_iter()
        .find(|w| w.id == wid)
        .ok_or_else(|| CoreError::NotFound(format!("workspace {wid}")))?;
    Ok(docs.join(&ws.name))
}

async fn read(
    State(st): State<Arc<ServerState>>,
    Path(wid): Path<String>,
) -> Result<Json<MethodologyConfig>, ApiError> {
    let dir = workspace_dir(st.engine.paths.docs(), &wid)?;
    Ok(Json(methodology::read_config(&dir)?))
}

async fn write(
    State(st): State<Arc<ServerState>>,
    Path(wid): Path<String>,
    Json(cfg): Json<MethodologyConfig>,
) -> Result<Json<MethodologyConfig>, ApiError> {
    let dir = workspace_dir(st.engine.paths.docs(), &wid)?;
    methodology::write_config(&dir, &cfg)?;
    st.engine
        .events
        .emit(SquadEvent::MethodologyConfigChanged { workspace_id: wid });
    Ok(Json(cfg))
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SeedQuery {
    #[serde(default)]
    force: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SeedResponse {
    files_created: Vec<String>,
    files_skipped: Vec<String>,
}

async fn seed(
    State(st): State<Arc<ServerState>>,
    Path((wid, pid)): Path<(String, String)>,
    Query(q): Query<SeedQuery>,
) -> Result<Json<SeedResponse>, ApiError> {
    let dir = workspace_dir(st.engine.paths.docs(), &wid)?;
    let cfg = methodology::read_config(&dir)?;
    let project = squad_projects::get(&dir, &pid)
        .map_err(|e| CoreError::NotFound(format!("project {pid}: {e}")))?;
    let report =
        methodology::seed_for_project(std::path::Path::new(&project.repo_path), &cfg, q.force)?;
    let files_created: Vec<String> = report
        .created
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    let files_skipped: Vec<String> = report
        .skipped
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    st.engine.events.emit(SquadEvent::MethodologySeeded {
        workspace_id: wid,
        project_id: pid,
        files_created: files_created.len() as u64,
        files_skipped: files_skipped.len() as u64,
    });
    Ok(Json(SeedResponse {
        files_created,
        files_skipped,
    }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectStatus {
    project_id: String,
    seeded: bool,
}

/// Returns per-project seeding status. A project is "seeded" if
/// `<repo_path>/.claude/method.config` exists. Cheap filesystem check;
/// no traversal of the full template set.
async fn status(
    State(st): State<Arc<ServerState>>,
    Path(wid): Path<String>,
) -> Result<Json<Vec<ProjectStatus>>, ApiError> {
    let dir = workspace_dir(st.engine.paths.docs(), &wid)?;
    let projects = squad_projects::list(&dir)
        .map_err(|e| CoreError::Internal(format!("list projects: {e}")))?;
    let out = projects
        .into_iter()
        .map(|p| {
            let seeded = std::path::Path::new(&p.repo_path)
                .join(".claude/method.config")
                .exists();
            ProjectStatus {
                project_id: p.id,
                seeded,
            }
        })
        .collect();
    Ok(Json(out))
}
