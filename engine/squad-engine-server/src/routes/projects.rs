//! `/v1/workspaces/:wid/projects` REST routes.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{
    extract::{Path, State},
    routing::get,
    Json, Router,
};
use squad_engine_core::workspaces;
use squad_engine_core::CoreError;
use squad_projects::{self, CreateProject, Project, UpdateProject};
use std::path::PathBuf;
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route("/workspaces/:wid/projects", get(list).post(create))
        .route(
            "/workspaces/:wid/projects/:id",
            get(fetch).patch(update).delete(delete_),
        )
}

fn workspace_root(docs: &std::path::Path, wid: &str) -> Result<PathBuf, ApiError> {
    let all = workspaces::read_all(docs)?;
    let ws = all
        .into_iter()
        .find(|w| w.id == wid)
        .ok_or_else(|| CoreError::NotFound(format!("workspace {wid}")))?;
    Ok(docs.join(&ws.name))
}

async fn list(
    State(st): State<Arc<ServerState>>,
    Path(wid): Path<String>,
) -> Result<Json<Vec<Project>>, ApiError> {
    let root = workspace_root(st.engine.paths.docs(), &wid)?;
    Ok(Json(squad_projects::list(&root)?))
}

async fn create(
    State(st): State<Arc<ServerState>>,
    Path(wid): Path<String>,
    Json(req): Json<CreateProject>,
) -> Result<Json<Project>, ApiError> {
    let root = workspace_root(st.engine.paths.docs(), &wid)?;
    Ok(Json(squad_projects::create(&root, req)?))
}

async fn fetch(
    State(st): State<Arc<ServerState>>,
    Path((wid, id)): Path<(String, String)>,
) -> Result<Json<Project>, ApiError> {
    let root = workspace_root(st.engine.paths.docs(), &wid)?;
    Ok(Json(squad_projects::get(&root, &id)?))
}

async fn update(
    State(st): State<Arc<ServerState>>,
    Path((wid, id)): Path<(String, String)>,
    Json(req): Json<UpdateProject>,
) -> Result<Json<Project>, ApiError> {
    let root = workspace_root(st.engine.paths.docs(), &wid)?;
    Ok(Json(squad_projects::update(&root, &id, req)?))
}

async fn delete_(
    State(st): State<Arc<ServerState>>,
    Path((wid, id)): Path<(String, String)>,
) -> Result<(), ApiError> {
    let root = workspace_root(st.engine.paths.docs(), &wid)?;
    squad_projects::delete(&root, &id)?;
    Ok(())
}
