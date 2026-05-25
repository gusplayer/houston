//! Workspace-level methodology config + seed orchestration.
//!
//! Persists `MethodologyConfig` at `<workspace>/.squad/methodology.json`.
//! Delegates the actual file writes into a project's repo to `squad-methodology`.

use crate::error::CoreResult;
use serde::{Deserialize, Serialize};
use squad_methodology::SeedOptions;
use std::fs;
use std::path::{Path, PathBuf};

pub use squad_methodology::SeedReport;

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MethodologyConfig {
    /// Master switch. When false the engine does not seed on project bind
    /// and does not remove existing seeded files.
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub trigger_mode: TriggerMode,
    /// Overrides `TARGET_BRANCH=main` in the seeded `.claude/method.config`.
    /// `None` lets the template default apply.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_branch: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum TriggerMode {
    Manual,
    #[default]
    PreMerge,
    PreCommit,
}

fn config_path(workspace_dir: &Path) -> PathBuf {
    workspace_dir.join(".squad").join("methodology.json")
}

pub fn read_config(workspace_dir: &Path) -> CoreResult<MethodologyConfig> {
    let p = config_path(workspace_dir);
    if !p.exists() {
        return Ok(MethodologyConfig::default());
    }
    let text = fs::read_to_string(&p)?;
    Ok(serde_json::from_str(&text)?)
}

pub fn write_config(workspace_dir: &Path, cfg: &MethodologyConfig) -> CoreResult<()> {
    let p = config_path(workspace_dir);
    let dir = p.parent().expect(".squad parent is workspace_dir");
    fs::create_dir_all(dir)?;
    let tmp = dir.join("methodology.json.tmp");
    let json = serde_json::to_string_pretty(cfg)?;
    fs::write(&tmp, &json)?;
    fs::rename(&tmp, &p)?;
    Ok(())
}

/// Seed the methodology files into a project's repo directory.
/// `project_repo_path` must point to an existing directory.
pub fn seed_for_project(
    project_repo_path: &Path,
    cfg: &MethodologyConfig,
    force: bool,
) -> CoreResult<SeedReport> {
    let opts = SeedOptions {
        force,
        target_branch: cfg.target_branch.clone(),
    };
    squad_methodology::seed_project_methodology(project_repo_path, opts)
        .map_err(|e| crate::error::CoreError::BadRequest(format!("methodology seed failed: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn workspace() -> TempDir {
        let d = TempDir::new().unwrap();
        fs::create_dir_all(d.path().join(".squad")).unwrap();
        d
    }

    #[test]
    fn read_missing_returns_default() {
        let d = workspace();
        let cfg = read_config(d.path()).unwrap();
        assert_eq!(cfg, MethodologyConfig::default());
        assert!(!cfg.enabled);
        assert_eq!(cfg.trigger_mode, TriggerMode::PreMerge);
        assert!(cfg.target_branch.is_none());
    }

    #[test]
    fn write_then_read_roundtrips() {
        let d = workspace();
        let cfg = MethodologyConfig {
            enabled: true,
            trigger_mode: TriggerMode::PreCommit,
            target_branch: Some("staging".into()),
        };
        write_config(d.path(), &cfg).unwrap();
        let loaded = read_config(d.path()).unwrap();
        assert_eq!(loaded, cfg);
    }

    #[test]
    fn config_json_uses_camel_case_and_kebab_enum() {
        let d = workspace();
        let cfg = MethodologyConfig {
            enabled: true,
            trigger_mode: TriggerMode::PreMerge,
            target_branch: Some("main".into()),
        };
        write_config(d.path(), &cfg).unwrap();
        let raw = fs::read_to_string(config_path(d.path())).unwrap();
        assert!(raw.contains("\"triggerMode\": \"pre-merge\""), "raw: {raw}");
        assert!(raw.contains("\"targetBranch\""), "raw: {raw}");
    }

    #[test]
    fn seed_for_project_writes_into_repo_dir() {
        let repo = TempDir::new().unwrap();
        let cfg = MethodologyConfig {
            enabled: true,
            trigger_mode: TriggerMode::PreMerge,
            target_branch: Some("staging".into()),
        };
        let report = seed_for_project(repo.path(), &cfg, false).unwrap();
        assert!(!report.created.is_empty());
        assert!(repo.path().join(".claude/method.config").exists());
        let cfg_body = fs::read_to_string(repo.path().join(".claude/method.config")).unwrap();
        assert!(cfg_body.contains("TARGET_BRANCH=staging"));
    }
}
