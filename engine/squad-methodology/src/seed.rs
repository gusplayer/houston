use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use serde::Serialize;
use thiserror::Error;

use crate::templates::{METHOD_CONFIG, TEMPLATES};

#[derive(Debug, Clone, Default)]
pub struct SeedOptions {
    /// Overwrite files that already exist. Default: false (existing files are skipped).
    pub force: bool,
    /// Replace `TARGET_BRANCH=main` in the seeded `method.config` with this value.
    pub target_branch: Option<String>,
}

#[derive(Debug, Default, Serialize)]
pub struct SeedReport {
    pub created: Vec<PathBuf>,
    pub skipped: Vec<PathBuf>,
}

#[derive(Debug, Error)]
pub enum SeedError {
    #[error("project path does not exist: {0}")]
    ProjectNotFound(PathBuf),
    #[error("project path is not a directory: {0}")]
    NotADirectory(PathBuf),
    #[error("io error at {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: io::Error,
    },
}

const METHOD_CONFIG_REL: &str = ".claude/method.config";

pub fn seed_project_methodology(
    project_path: &Path,
    opts: SeedOptions,
) -> Result<SeedReport, SeedError> {
    if !project_path.exists() {
        return Err(SeedError::ProjectNotFound(project_path.to_path_buf()));
    }
    if !project_path.is_dir() {
        return Err(SeedError::NotADirectory(project_path.to_path_buf()));
    }

    let rendered_config = render_method_config(opts.target_branch.as_deref());
    let mut report = SeedReport::default();

    for (rel_path, content) in TEMPLATES.iter() {
        let dest = project_path.join(rel_path);

        if dest.exists() && !opts.force {
            report.skipped.push(dest);
            continue;
        }

        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| SeedError::Io {
                path: parent.to_path_buf(),
                source: e,
            })?;
        }

        let body: &str = if *rel_path == METHOD_CONFIG_REL {
            &rendered_config
        } else {
            content
        };

        write_atomic(&dest, body).map_err(|e| SeedError::Io {
            path: dest.clone(),
            source: e,
        })?;

        if rel_path.ends_with(".sh") {
            set_executable(&dest).map_err(|e| SeedError::Io {
                path: dest.clone(),
                source: e,
            })?;
        }

        report.created.push(dest);
    }

    Ok(report)
}

fn render_method_config(target_branch: Option<&str>) -> String {
    match target_branch {
        Some(branch) if branch != "main" => {
            METHOD_CONFIG.replace("TARGET_BRANCH=main", &format!("TARGET_BRANCH={branch}"))
        }
        _ => METHOD_CONFIG.to_string(),
    }
}

fn write_atomic(dest: &Path, content: &str) -> io::Result<()> {
    let tmp = dest.with_extension("tmp-seed");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(content.as_bytes())?;
        f.sync_all()?;
    }
    fs::rename(&tmp, dest)
}

#[cfg(unix)]
fn set_executable(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = fs::metadata(path)?.permissions();
    perms.set_mode(perms.mode() | 0o111);
    fs::set_permissions(path, perms)
}

#[cfg(not(unix))]
fn set_executable(_path: &Path) -> io::Result<()> {
    Ok(())
}
