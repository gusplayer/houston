//! `/v1/workspaces/:wid/projects/:id/git/*` REST routes.
//!
//! Project-scoped git operations. The handler chain is:
//! workspace id → workspace root → project → project.repo_path → squad_git op.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use squad_engine_core::workspaces;
use squad_engine_core::CoreError;
use squad_git::{Branch, Commit, GitStatus};
use squad_projects;
use std::path::PathBuf;
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route(
            "/workspaces/:wid/projects/:id/git/status",
            get(status_route),
        )
        .route(
            "/workspaces/:wid/projects/:id/git/current-branch",
            get(current_branch_route),
        )
        .route("/workspaces/:wid/projects/:id/git/log", get(log_route))
        .route(
            "/workspaces/:wid/projects/:id/git/branches",
            get(branches_route),
        )
        .route("/workspaces/:wid/projects/:id/git/diff", get(diff_route))
}

fn repo_path_for(docs: &std::path::Path, wid: &str, project_id: &str) -> Result<PathBuf, ApiError> {
    let all = workspaces::read_all(docs)?;
    let ws = all
        .into_iter()
        .find(|w| w.id == wid)
        .ok_or_else(|| CoreError::NotFound(format!("workspace {wid}")))?;
    let ws_root = docs.join(&ws.name);
    let project = squad_projects::get(&ws_root, project_id)?;
    Ok(PathBuf::from(project.repo_path))
}

async fn status_route(
    State(st): State<Arc<ServerState>>,
    Path((wid, id)): Path<(String, String)>,
) -> Result<Json<GitStatus>, ApiError> {
    let repo = repo_path_for(st.engine.paths.docs(), &wid, &id)?;
    Ok(Json(squad_git::status(&repo)?))
}

async fn current_branch_route(
    State(st): State<Arc<ServerState>>,
    Path((wid, id)): Path<(String, String)>,
) -> Result<Json<String>, ApiError> {
    let repo = repo_path_for(st.engine.paths.docs(), &wid, &id)?;
    Ok(Json(squad_git::current_branch(&repo)?))
}

#[derive(Deserialize)]
struct LogQuery {
    #[serde(default = "default_log_limit")]
    limit: u32,
}

fn default_log_limit() -> u32 {
    20
}

async fn log_route(
    State(st): State<Arc<ServerState>>,
    Path((wid, id)): Path<(String, String)>,
    Query(q): Query<LogQuery>,
) -> Result<Json<Vec<Commit>>, ApiError> {
    let repo = repo_path_for(st.engine.paths.docs(), &wid, &id)?;
    Ok(Json(squad_git::log(&repo, q.limit)?))
}

async fn branches_route(
    State(st): State<Arc<ServerState>>,
    Path((wid, id)): Path<(String, String)>,
) -> Result<Json<Vec<Branch>>, ApiError> {
    let repo = repo_path_for(st.engine.paths.docs(), &wid, &id)?;
    Ok(Json(squad_git::branches(&repo)?))
}

#[derive(Deserialize)]
struct DiffQuery {
    from: Option<String>,
    to: Option<String>,
}

async fn diff_route(
    State(st): State<Arc<ServerState>>,
    Path((wid, id)): Path<(String, String)>,
    Query(q): Query<DiffQuery>,
) -> Result<Json<String>, ApiError> {
    let repo = repo_path_for(st.engine.paths.docs(), &wid, &id)?;
    Ok(Json(squad_git::diff(
        &repo,
        q.from.as_deref(),
        q.to.as_deref(),
    )?))
}
