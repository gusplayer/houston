use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MethodConfig {
    pub target_branch: String,
    pub typecheck_cmd: String,
    pub test_cmd: String,
    pub build_cmd: String,
    pub lint_cmd: Option<String>,
}

impl Default for MethodConfig {
    fn default() -> Self {
        Self {
            target_branch: "main".to_string(),
            typecheck_cmd: "pnpm typecheck".to_string(),
            test_cmd: "pnpm test".to_string(),
            build_cmd: "pnpm build".to_string(),
            lint_cmd: None,
        }
    }
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("io error reading {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: io::Error,
    },
}

/// Parse a `.claude/method.config` file. Missing file returns defaults.
/// Unknown keys are ignored. Malformed lines are skipped.
pub fn parse_method_config(path: &Path) -> Result<MethodConfig, ConfigError> {
    if !path.exists() {
        return Ok(MethodConfig::default());
    }
    let text = fs::read_to_string(path).map_err(|e| ConfigError::Io {
        path: path.to_path_buf(),
        source: e,
    })?;
    Ok(parse_from_str(&text))
}

fn parse_from_str(text: &str) -> MethodConfig {
    let mut cfg = MethodConfig::default();
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, val)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        let val = unquote(val.trim());
        match key {
            "TARGET_BRANCH" => cfg.target_branch = val.to_string(),
            "TYPECHECK_CMD" => cfg.typecheck_cmd = val.to_string(),
            "TEST_CMD" => cfg.test_cmd = val.to_string(),
            "BUILD_CMD" => cfg.build_cmd = val.to_string(),
            "LINT_CMD" => {
                cfg.lint_cmd = if val.is_empty() {
                    None
                } else {
                    Some(val.to_string())
                };
            }
            _ => {}
        }
    }
    cfg
}

fn unquote(s: &str) -> &str {
    let bytes = s.as_bytes();
    if bytes.len() >= 2 {
        let first = bytes[0];
        let last = bytes[bytes.len() - 1];
        if (first == b'"' && last == b'"') || (first == b'\'' && last == b'\'') {
            return &s[1..s.len() - 1];
        }
    }
    s
}
