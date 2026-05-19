//! Project (repo binding) management for Squad workspaces.
//!
//! A Project binds a workspace to a local git repository. Agents in that
//! workspace can read/write/run tooling against the project's `repo_path`.
//! Future Milestones (C.1+) will add sprints, stories, epics, releases, and
//! handoffs as subdirectories under each project.
//!
//! Storage layout (per workspace):
//! ```text
//! <workspace>/.squad/projects.json           # array of Project metadata
//! <workspace>/.squad/projects/<id>/          # reserved for future per-project data
//! ```
//!
//! Transport-neutral: all functions take `workspace_root: &Path` and operate
//! on the filesystem. HTTP routes, CLI tools, and tests all call these
//! functions.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;
use uuid::Uuid;

// ── Errors ─────────────────────────────────────────────────────────────────

#[derive(Debug, Error)]
pub enum ProjectError {
    #[error("IO error: {0}")]
    Io(String),
    #[error("JSON error: {0}")]
    Json(String),
    #[error("Project not found: {0}")]
    NotFound(String),
    #[error("Project already exists with name {0:?}")]
    DuplicateName(String),
    #[error("Project already exists with repo_path {0:?}")]
    DuplicateRepoPath(String),
    #[error("Invalid request: {0}")]
    BadRequest(String),
}

impl From<std::io::Error> for ProjectError {
    fn from(e: std::io::Error) -> Self {
        ProjectError::Io(e.to_string())
    }
}

impl From<serde_json::Error> for ProjectError {
    fn from(e: serde_json::Error) -> Self {
        ProjectError::Json(e.to_string())
    }
}

pub type ProjectResult<T> = Result<T, ProjectError>;

// ── Types ──────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    /// Absolute path to the local git repo working tree.
    pub repo_path: String,
    /// Origin remote URL (https or ssh form), if known. Optional — projects
    /// without a remote (local-only / private experiment) are valid.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repo_remote: Option<String>,
    /// Free-form stack identifier. Examples: "nextjs-vercel-neon",
    /// "rails-render", "rust-axum-fly", "react-native-maestro". Templates
    /// in `templates/<stack>/` may seed role agents based on this value.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stack: Option<String>,
    /// Default branch name. Most repos: "main". Inferred when not provided.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_branch: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreateProject {
    pub name: String,
    pub repo_path: String,
    pub repo_remote: Option<String>,
    pub stack: Option<String>,
    pub default_branch: Option<String>,
}

#[derive(Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProject {
    pub name: Option<String>,
    pub repo_path: Option<String>,
    pub repo_remote: Option<String>,
    pub stack: Option<String>,
    pub default_branch: Option<String>,
}

// ── Persistence ────────────────────────────────────────────────────────────

fn squad_dir(workspace_root: &Path) -> PathBuf {
    workspace_root.join(".squad")
}

fn json_path(workspace_root: &Path) -> PathBuf {
    squad_dir(workspace_root).join("projects.json")
}

fn project_dir(workspace_root: &Path, id: &str) -> PathBuf {
    squad_dir(workspace_root).join("projects").join(id)
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn read_all(workspace_root: &Path) -> ProjectResult<Vec<Project>> {
    let path = json_path(workspace_root);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let contents = fs::read_to_string(&path)?;
    let parsed: Vec<Project> = serde_json::from_str(&contents)?;
    Ok(parsed)
}

fn write_all(workspace_root: &Path, projects: &[Project]) -> ProjectResult<()> {
    let dir = squad_dir(workspace_root);
    fs::create_dir_all(&dir)?;
    let target = json_path(workspace_root);
    let tmp = dir.join("projects.json.tmp");
    let json = serde_json::to_string_pretty(projects)?;
    fs::write(&tmp, &json)?;
    fs::rename(&tmp, &target)?;
    Ok(())
}

// ── API ────────────────────────────────────────────────────────────────────

pub fn list(workspace_root: &Path) -> ProjectResult<Vec<Project>> {
    read_all(workspace_root)
}

pub fn get(workspace_root: &Path, id: &str) -> ProjectResult<Project> {
    read_all(workspace_root)?
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| ProjectError::NotFound(id.to_string()))
}

pub fn create(workspace_root: &Path, req: CreateProject) -> ProjectResult<Project> {
    if req.name.trim().is_empty() {
        return Err(ProjectError::BadRequest("name must not be empty".into()));
    }
    if req.repo_path.trim().is_empty() {
        return Err(ProjectError::BadRequest("repoPath must not be empty".into()));
    }

    let mut projects = read_all(workspace_root)?;

    if projects.iter().any(|p| p.name == req.name) {
        return Err(ProjectError::DuplicateName(req.name));
    }
    if projects.iter().any(|p| p.repo_path == req.repo_path) {
        return Err(ProjectError::DuplicateRepoPath(req.repo_path));
    }

    let now = now_iso();
    let project = Project {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        repo_path: req.repo_path,
        repo_remote: req.repo_remote,
        stack: req.stack,
        default_branch: req.default_branch,
        created_at: now.clone(),
        updated_at: now,
    };

    fs::create_dir_all(project_dir(workspace_root, &project.id))?;
    projects.push(project.clone());
    write_all(workspace_root, &projects)?;
    Ok(project)
}

pub fn update(workspace_root: &Path, id: &str, req: UpdateProject) -> ProjectResult<Project> {
    let mut projects = read_all(workspace_root)?;

    // Pre-validate uniqueness on rename/move before mutating.
    if let Some(ref new_name) = req.name {
        if projects.iter().any(|p| p.name == *new_name && p.id != id) {
            return Err(ProjectError::DuplicateName(new_name.clone()));
        }
    }
    if let Some(ref new_path) = req.repo_path {
        if projects.iter().any(|p| p.repo_path == *new_path && p.id != id) {
            return Err(ProjectError::DuplicateRepoPath(new_path.clone()));
        }
    }

    let project = projects
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or_else(|| ProjectError::NotFound(id.to_string()))?;

    if let Some(name) = req.name {
        project.name = name;
    }
    if let Some(repo_path) = req.repo_path {
        project.repo_path = repo_path;
    }
    if req.repo_remote.is_some() {
        project.repo_remote = req.repo_remote;
    }
    if req.stack.is_some() {
        project.stack = req.stack;
    }
    if req.default_branch.is_some() {
        project.default_branch = req.default_branch;
    }
    project.updated_at = now_iso();

    let updated = project.clone();
    write_all(workspace_root, &projects)?;
    Ok(updated)
}

pub fn delete(workspace_root: &Path, id: &str) -> ProjectResult<()> {
    let projects = read_all(workspace_root)?;
    if !projects.iter().any(|p| p.id == id) {
        return Err(ProjectError::NotFound(id.to_string()));
    }
    let remaining: Vec<Project> = projects.into_iter().filter(|p| p.id != id).collect();
    write_all(workspace_root, &remaining)?;
    let pdir = project_dir(workspace_root, id);
    if pdir.exists() {
        fs::remove_dir_all(&pdir)?;
    }
    Ok(())
}

// ── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn tmp() -> TempDir {
        TempDir::new().unwrap()
    }

    fn make(name: &str, repo_path: &str) -> CreateProject {
        CreateProject {
            name: name.into(),
            repo_path: repo_path.into(),
            repo_remote: None,
            stack: None,
            default_branch: None,
        }
    }

    #[test]
    fn list_empty_returns_empty() {
        let d = tmp();
        assert!(list(d.path()).unwrap().is_empty());
    }

    #[test]
    fn create_then_list_and_get() {
        let d = tmp();
        let p = create(d.path(), make("acme-web", "/repos/acme-web")).unwrap();
        assert_eq!(p.name, "acme-web");
        assert!(!p.id.is_empty());
        assert_eq!(p.created_at, p.updated_at);

        let all = list(d.path()).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, p.id);

        let fetched = get(d.path(), &p.id).unwrap();
        assert_eq!(fetched.repo_path, "/repos/acme-web");

        // Project subdir created for future per-project data.
        assert!(d.path().join(".squad/projects").join(&p.id).exists());
    }

    #[test]
    fn create_with_all_fields() {
        let d = tmp();
        let p = create(
            d.path(),
            CreateProject {
                name: "api".into(),
                repo_path: "/repos/api".into(),
                repo_remote: Some("git@github.com:acme/api.git".into()),
                stack: Some("rust-axum-fly".into()),
                default_branch: Some("main".into()),
            },
        )
        .unwrap();
        assert_eq!(p.stack.as_deref(), Some("rust-axum-fly"));
        assert_eq!(p.default_branch.as_deref(), Some("main"));
    }

    #[test]
    fn create_rejects_empty_name() {
        let d = tmp();
        let err = create(d.path(), make("", "/repos/x")).unwrap_err();
        assert!(matches!(err, ProjectError::BadRequest(_)));
    }

    #[test]
    fn create_rejects_empty_repo_path() {
        let d = tmp();
        let err = create(d.path(), make("x", "")).unwrap_err();
        assert!(matches!(err, ProjectError::BadRequest(_)));
    }

    #[test]
    fn create_rejects_duplicate_name() {
        let d = tmp();
        create(d.path(), make("alpha", "/r1")).unwrap();
        let err = create(d.path(), make("alpha", "/r2")).unwrap_err();
        assert!(matches!(err, ProjectError::DuplicateName(_)));
    }

    #[test]
    fn create_rejects_duplicate_repo_path() {
        let d = tmp();
        create(d.path(), make("alpha", "/r1")).unwrap();
        let err = create(d.path(), make("beta", "/r1")).unwrap_err();
        assert!(matches!(err, ProjectError::DuplicateRepoPath(_)));
    }

    #[test]
    fn update_renames_and_changes_fields() {
        let d = tmp();
        let p = create(d.path(), make("alpha", "/r1")).unwrap();

        let updated = update(
            d.path(),
            &p.id,
            UpdateProject {
                name: Some("alpha-v2".into()),
                repo_path: None,
                repo_remote: Some("https://github.com/acme/alpha".into()),
                stack: Some("nextjs-vercel-neon".into()),
                default_branch: Some("develop".into()),
            },
        )
        .unwrap();

        assert_eq!(updated.name, "alpha-v2");
        assert_eq!(updated.repo_path, "/r1"); // unchanged
        assert_eq!(updated.repo_remote.as_deref(), Some("https://github.com/acme/alpha"));
        assert_eq!(updated.stack.as_deref(), Some("nextjs-vercel-neon"));
        assert_eq!(updated.default_branch.as_deref(), Some("develop"));
        assert!(updated.updated_at >= updated.created_at);
    }

    #[test]
    fn update_missing_id_returns_not_found() {
        let d = tmp();
        let err = update(d.path(), "nope", UpdateProject::default()).unwrap_err();
        assert!(matches!(err, ProjectError::NotFound(_)));
    }

    #[test]
    fn update_rejects_rename_collision() {
        let d = tmp();
        create(d.path(), make("alpha", "/r1")).unwrap();
        let b = create(d.path(), make("beta", "/r2")).unwrap();
        let err = update(
            d.path(),
            &b.id,
            UpdateProject {
                name: Some("alpha".into()),
                ..Default::default()
            },
        )
        .unwrap_err();
        assert!(matches!(err, ProjectError::DuplicateName(_)));
    }

    #[test]
    fn delete_removes_project_and_subdir() {
        let d = tmp();
        let p = create(d.path(), make("alpha", "/r1")).unwrap();
        let pdir = d.path().join(".squad/projects").join(&p.id);
        assert!(pdir.exists());

        delete(d.path(), &p.id).unwrap();
        assert!(list(d.path()).unwrap().is_empty());
        assert!(!pdir.exists());
    }

    #[test]
    fn delete_missing_id_returns_not_found() {
        let d = tmp();
        let err = delete(d.path(), "ghost").unwrap_err();
        assert!(matches!(err, ProjectError::NotFound(_)));
    }
}
