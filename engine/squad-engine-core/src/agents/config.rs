//! Read/write operations for `.squad/config/config.json`.

use super::store::write_json;
use super::types::ProjectConfig;
use crate::error::{CoreError, CoreResult};
use squad_agent_files as files;
use std::path::Path;

const FILE: &str = "config";
const REL: &str = ".squad/config/config.json";

/// Read the project config. Returns a default if the file doesn't exist.
pub fn read(root: &Path) -> CoreResult<ProjectConfig> {
    let contents = files::read_file(root, REL)
        .map_err(|e| CoreError::Internal(format!("failed to read config: {e}")))?;
    if contents.is_empty() {
        return Ok(ProjectConfig::default());
    }
    serde_json::from_str(&contents).map_err(Into::into)
}

/// Write the project config (atomic write via temp + rename).
pub fn write(root: &Path, config: &ProjectConfig) -> CoreResult<()> {
    write_json(root, FILE, config)
}
