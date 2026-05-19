//! Shared helpers for typed JSON I/O under `.squad/<type>/<type>.json`.
//!
//! Delegates atomic writes + path-traversal safety to `squad-agent-files`.

use crate::error::{CoreError, CoreResult};
use squad_agent_files as files;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::path::{Path, PathBuf};

/// Returns the `.squad/` directory inside an agent root.
pub fn squad_dir(root: &Path) -> PathBuf {
    root.join(".squad")
}

/// Creates `.squad/` if it doesn't exist.
pub fn ensure_squad_dir(root: &Path) -> CoreResult<()> {
    let dir = squad_dir(root);
    std::fs::create_dir_all(&dir).map_err(|e| {
        CoreError::Internal(format!("failed to create .squad directory: {e}"))
    })?;
    Ok(())
}

/// Build the relative path for a given type: `.squad/<name>/<name>.json`.
fn rel_path(name: &str) -> String {
    format!(".squad/{name}/{name}.json")
}

/// Read and deserialize `.squad/<name>/<name>.json`.
/// Returns `T::default()` if the file does not exist or is empty.
pub fn read_json<T: DeserializeOwned + Default>(root: &Path, name: &str) -> CoreResult<T> {
    let rel = rel_path(name);
    let contents = files::read_file(root, &rel)
        .map_err(|e| CoreError::Internal(format!("failed to read {rel}: {e}")))?;
    if contents.is_empty() {
        return Ok(T::default());
    }
    serde_json::from_str(&contents).map_err(Into::into)
}

/// Atomically write a typed value as `.squad/<name>/<name>.json`.
pub fn write_json<T: Serialize>(root: &Path, name: &str, data: &T) -> CoreResult<()> {
    let rel = rel_path(name);
    let body = serde_json::to_string_pretty(data)?;
    files::write_file_atomic(root, &rel, &body)
        .map_err(|e| CoreError::Internal(format!("failed to write {rel}: {e}")))
}
