//! Map `CoreError` to HTTP status + `ErrorBody`.

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use squad_engine_core::CoreError;
use squad_engine_protocol::{ErrorBody, ErrorCode, ErrorDetail};
use squad_git::GitError;
use squad_projects::ProjectError;

pub struct ApiError(pub CoreError);

impl From<CoreError> for ApiError {
    fn from(e: CoreError) -> Self {
        Self(e)
    }
}

impl From<ProjectError> for ApiError {
    fn from(e: ProjectError) -> Self {
        let core = match e {
            ProjectError::NotFound(id) => CoreError::NotFound(format!("project {id}")),
            ProjectError::DuplicateName(name) => {
                CoreError::Conflict(format!("project named {name:?} already exists"))
            }
            ProjectError::DuplicateRepoPath(p) => {
                CoreError::Conflict(format!("project with repoPath {p:?} already exists"))
            }
            ProjectError::BadRequest(m) => CoreError::BadRequest(m),
            ProjectError::Io(m) => CoreError::Internal(format!("project io: {m}")),
            ProjectError::Json(m) => CoreError::Internal(format!("project json: {m}")),
        };
        Self(core)
    }
}

impl From<GitError> for ApiError {
    fn from(e: GitError) -> Self {
        let core = match e {
            GitError::NotARepo(p) => CoreError::BadRequest(format!("not a git repository: {p}")),
            GitError::GitMissing => CoreError::Unavailable("git binary not found on PATH".into()),
            GitError::CommandFailed { code, stderr } => {
                CoreError::BadRequest(format!("git failed (exit {code}): {stderr}"))
            }
            GitError::Io(m) => CoreError::Internal(format!("git io: {m}")),
            GitError::Parse(m) => CoreError::Internal(format!("git parse: {m}")),
        };
        Self(core)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let code = self.0.code();
        let status = match code {
            ErrorCode::NotFound => StatusCode::NOT_FOUND,
            ErrorCode::Conflict => StatusCode::CONFLICT,
            ErrorCode::BadRequest => StatusCode::BAD_REQUEST,
            ErrorCode::Unauthorized => StatusCode::UNAUTHORIZED,
            ErrorCode::Forbidden => StatusCode::FORBIDDEN,
            ErrorCode::Unavailable => StatusCode::SERVICE_UNAVAILABLE,
            ErrorCode::VersionMismatch => StatusCode::CONFLICT,
            ErrorCode::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        };
        let details = self
            .0
            .kind()
            .map(|kind| serde_json::json!({ "kind": kind }));
        (
            status,
            Json(ErrorBody {
                error: ErrorDetail {
                    code,
                    message: self.0.to_string(),
                    details,
                },
            }),
        )
            .into_response()
    }
}
