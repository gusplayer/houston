//! `/v1/workspaces/:wid/projects` REST routes.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{
    extract::{Path, State},
    routing::get,
    Json, Router,
};
use squad_engine_core::methodology;
use squad_engine_core::workspaces;
use squad_engine_core::CoreError;
use squad_projects::{self, CreateProject, Project, UpdateProject};
use squad_ui_events::SquadEvent;
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
    let project = squad_projects::create(&root, req)?;
    if let Err(err) = maybe_auto_seed(&st, &root, &wid, &project) {
        tracing::warn!(project_id = %project.id, "methodology auto-seed failed: {err}");
        st.engine.events.emit(SquadEvent::Toast {
            message: format!("Methodology auto-seed failed: {err}"),
            variant: "warning".to_string(),
        });
    }
    Ok(Json(project))
}

fn maybe_auto_seed(
    st: &ServerState,
    workspace_dir: &std::path::Path,
    wid: &str,
    project: &Project,
) -> Result<(), CoreError> {
    let cfg = methodology::read_config(workspace_dir)?;
    if !cfg.enabled {
        return Ok(());
    }
    let report =
        methodology::seed_for_project(std::path::Path::new(&project.repo_path), &cfg, false)?;
    st.engine.events.emit(SquadEvent::MethodologySeeded {
        workspace_id: wid.to_string(),
        project_id: project.id.clone(),
        files_created: report.created.len() as u64,
        files_skipped: report.skipped.len() as u64,
    });
    Ok(())
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
