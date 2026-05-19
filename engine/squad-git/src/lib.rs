//! Git operations for Squad — shells out to the `git` CLI.
//!
//! Squad's target audience is software engineers, all of whom have `git`
//! installed on their machine. Shelling out is simpler than vendoring
//! libgit2 (no native deps to build, no PCRE/SSH/HTTPS config sprawl) and
//! keeps the working-tree state perfectly aligned with what the developer
//! sees on the command line.
//!
//! Every operation takes the repo working-tree path as its first argument
//! and returns a typed result. Functions are transport-neutral: HTTP routes,
//! CLI tools, and tests all call the same API.

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use thiserror::Error;

// ── Errors ─────────────────────────────────────────────────────────────────

#[derive(Debug, Error)]
pub enum GitError {
    #[error("git binary not found on PATH")]
    GitMissing,
    #[error("not a git repository: {0}")]
    NotARepo(String),
    #[error("git command failed (exit {code}): {stderr}")]
    CommandFailed { code: i32, stderr: String },
    #[error("io error: {0}")]
    Io(String),
    #[error("parse error: {0}")]
    Parse(String),
}

impl From<std::io::Error> for GitError {
    fn from(e: std::io::Error) -> Self {
        if e.kind() == std::io::ErrorKind::NotFound {
            GitError::GitMissing
        } else {
            GitError::Io(e.to_string())
        }
    }
}

pub type GitResult<T> = Result<T, GitError>;

// ── Types ──────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub branch: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub staged: Vec<FileChange>,
    pub unstaged: Vec<FileChange>,
    pub untracked: Vec<String>,
    pub clean: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    /// Single-character git status code: M, A, D, R, C, T, U.
    pub code: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub sha: String,
    pub short_sha: String,
    pub author_name: String,
    pub author_email: String,
    pub date: String,
    pub subject: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
}

// ── Helpers ────────────────────────────────────────────────────────────────

fn run_git(repo: &Path, args: &[&str]) -> GitResult<String> {
    if !repo.exists() {
        return Err(GitError::NotARepo(repo.display().to_string()));
    }
    let out = Command::new("git").arg("-C").arg(repo).args(args).output()?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).to_string();
        let lower = stderr.to_lowercase();
        if lower.contains("not a git repository") {
            return Err(GitError::NotARepo(repo.display().to_string()));
        }
        return Err(GitError::CommandFailed {
            code: out.status.code().unwrap_or(-1),
            stderr,
        });
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

// ── API ────────────────────────────────────────────────────────────────────

/// Working tree status: branch, ahead/behind tracking, staged + unstaged + untracked changes.
pub fn status(repo: &Path) -> GitResult<GitStatus> {
    let raw = run_git(repo, &["status", "--porcelain=v2", "--branch", "--untracked-files=all"])?;

    let mut branch: Option<String> = None;
    let mut ahead = 0u32;
    let mut behind = 0u32;
    let mut staged: Vec<FileChange> = Vec::new();
    let mut unstaged: Vec<FileChange> = Vec::new();
    let mut untracked: Vec<String> = Vec::new();

    for line in raw.lines() {
        if let Some(rest) = line.strip_prefix("# branch.head ") {
            branch = Some(rest.to_string());
        } else if let Some(rest) = line.strip_prefix("# branch.ab ") {
            for tok in rest.split_whitespace() {
                if let Some(num) = tok.strip_prefix('+') {
                    ahead = num.parse().unwrap_or(0);
                } else if let Some(num) = tok.strip_prefix('-') {
                    behind = num.parse().unwrap_or(0);
                }
            }
        } else if let Some(rest) = line.strip_prefix("? ") {
            untracked.push(rest.to_string());
        } else if line.starts_with("1 ") || line.starts_with("2 ") {
            // porcelain v2 entry: `<kind> <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>`
            let parts: Vec<&str> = line.splitn(9, ' ').collect();
            if parts.len() < 9 {
                continue;
            }
            let xy = parts[1];
            let path = parts[8].to_string();
            let x = xy.chars().next().unwrap_or('.');
            let y = xy.chars().nth(1).unwrap_or('.');
            if x != '.' {
                staged.push(FileChange {
                    path: path.clone(),
                    code: x.to_string(),
                });
            }
            if y != '.' {
                unstaged.push(FileChange {
                    path,
                    code: y.to_string(),
                });
            }
        }
    }

    let clean = staged.is_empty() && unstaged.is_empty() && untracked.is_empty();
    Ok(GitStatus {
        branch,
        ahead,
        behind,
        staged,
        unstaged,
        untracked,
        clean,
    })
}

/// Current branch name (or detached HEAD short sha).
pub fn current_branch(repo: &Path) -> GitResult<String> {
    let raw = run_git(repo, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    Ok(raw.trim().to_string())
}

/// Recent commits on HEAD. `limit` caps the number returned.
pub fn log(repo: &Path, limit: u32) -> GitResult<Vec<Commit>> {
    // Use unit separator (US, 0x1F) between fields and record separator (RS, 0x1E)
    // between commits — guarantees collisions can't happen on commit subjects.
    let fmt = "%H\x1f%h\x1f%an\x1f%ae\x1f%aI\x1f%s\x1e";
    let raw = run_git(
        repo,
        &[
            "log",
            &format!("-{limit}"),
            &format!("--pretty=format:{fmt}"),
        ],
    )?;

    let mut commits = Vec::new();
    for record in raw.split('\x1e') {
        let record = record.trim_start_matches('\n').trim();
        if record.is_empty() {
            continue;
        }
        let fields: Vec<&str> = record.splitn(6, '\x1f').collect();
        if fields.len() < 6 {
            continue;
        }
        commits.push(Commit {
            sha: fields[0].to_string(),
            short_sha: fields[1].to_string(),
            author_name: fields[2].to_string(),
            author_email: fields[3].to_string(),
            date: fields[4].to_string(),
            subject: fields[5].to_string(),
        });
    }
    Ok(commits)
}

/// Local + remote branches with current-branch flag.
pub fn branches(repo: &Path) -> GitResult<Vec<Branch>> {
    // `%(refname:short)` gives `main` for local, `origin/main` for remote.
    // `%(HEAD)` is `*` for the current branch, ` ` otherwise.
    let raw = run_git(
        repo,
        &[
            "for-each-ref",
            "--format=%(HEAD)%(refname:short)\t%(objecttype)\t%(refname)",
            "refs/heads/",
            "refs/remotes/",
        ],
    )?;
    let mut out = Vec::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let is_current = line.starts_with('*');
        let rest = if is_current { &line[1..] } else { line };
        let parts: Vec<&str> = rest.split('\t').collect();
        if parts.is_empty() {
            continue;
        }
        let name = parts[0].to_string();
        let is_remote = parts.get(2).map(|r| r.starts_with("refs/remotes/")).unwrap_or(false);
        // Skip HEAD pseudo-refs like "origin/HEAD"
        if is_remote && name.ends_with("/HEAD") {
            continue;
        }
        out.push(Branch {
            name,
            is_current,
            is_remote,
        });
    }
    Ok(out)
}

/// Unified diff between two refs (or vs working tree when `to` is `None`).
///
/// - `from = None, to = None` → diff of unstaged changes in working tree
/// - `from = Some("HEAD"), to = None` → diff of working tree vs HEAD (working + staged)
/// - `from = Some("A"), to = Some("B")` → diff between two refs
pub fn diff(repo: &Path, from: Option<&str>, to: Option<&str>) -> GitResult<String> {
    let mut args: Vec<&str> = vec!["diff", "--no-color"];
    if let Some(f) = from {
        args.push(f);
    }
    if let Some(t) = to {
        args.push(t);
    }
    run_git(repo, &args)
}

// ── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use tempfile::TempDir;

    /// Initialize a git repo at the given path with a base commit. Returns the path.
    fn init_repo() -> (TempDir, PathBuf) {
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_path_buf();
        run_git(&path, &["init", "--initial-branch=main"]).unwrap();
        run_git(&path, &["config", "user.email", "dev@squad.test"]).unwrap();
        run_git(&path, &["config", "user.name", "Squad Dev"]).unwrap();
        run_git(&path, &["config", "commit.gpgsign", "false"]).unwrap();
        fs::write(path.join("README.md"), "# test\n").unwrap();
        run_git(&path, &["add", "README.md"]).unwrap();
        run_git(&path, &["commit", "-m", "initial commit"]).unwrap();
        (dir, path)
    }

    #[test]
    fn status_clean_after_init() {
        let (_d, p) = init_repo();
        let s = status(&p).unwrap();
        assert_eq!(s.branch.as_deref(), Some("main"));
        assert!(s.clean);
        assert!(s.staged.is_empty());
        assert!(s.unstaged.is_empty());
        assert!(s.untracked.is_empty());
    }

    #[test]
    fn status_detects_untracked_and_unstaged_and_staged() {
        let (_d, p) = init_repo();

        // untracked
        fs::write(p.join("new.txt"), "x").unwrap();
        // modify tracked
        fs::write(p.join("README.md"), "# changed\n").unwrap();
        // stage modification
        run_git(&p, &["add", "README.md"]).unwrap();

        let s = status(&p).unwrap();
        assert!(!s.clean);
        assert_eq!(s.untracked, vec!["new.txt".to_string()]);
        assert_eq!(s.staged.len(), 1);
        assert_eq!(s.staged[0].path, "README.md");
        assert_eq!(s.staged[0].code, "M");
    }

    #[test]
    fn current_branch_returns_main() {
        let (_d, p) = init_repo();
        let b = current_branch(&p).unwrap();
        assert_eq!(b, "main");
    }

    #[test]
    fn log_returns_initial_commit() {
        let (_d, p) = init_repo();
        let commits = log(&p, 10).unwrap();
        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].subject, "initial commit");
        assert_eq!(commits[0].author_email, "dev@squad.test");
        assert!(!commits[0].sha.is_empty());
        assert_eq!(commits[0].short_sha.len(), 7);
    }

    #[test]
    fn log_respects_limit() {
        let (_d, p) = init_repo();
        for n in 0..5 {
            fs::write(p.join("f.txt"), format!("{n}")).unwrap();
            run_git(&p, &["add", "f.txt"]).unwrap();
            run_git(&p, &["commit", "-m", &format!("c{n}")]).unwrap();
        }
        let three = log(&p, 3).unwrap();
        assert_eq!(three.len(), 3);
        let all = log(&p, 100).unwrap();
        assert_eq!(all.len(), 6);
    }

    #[test]
    fn branches_lists_local_with_current() {
        let (_d, p) = init_repo();
        run_git(&p, &["branch", "feature/x"]).unwrap();
        let bs = branches(&p).unwrap();
        let names: Vec<&str> = bs.iter().map(|b| b.name.as_str()).collect();
        assert!(names.contains(&"main"));
        assert!(names.contains(&"feature/x"));
        let main = bs.iter().find(|b| b.name == "main").unwrap();
        assert!(main.is_current);
        assert!(!main.is_remote);
        let feat = bs.iter().find(|b| b.name == "feature/x").unwrap();
        assert!(!feat.is_current);
    }

    #[test]
    fn diff_working_tree_vs_head() {
        let (_d, p) = init_repo();
        fs::write(p.join("README.md"), "# changed\n").unwrap();
        let d = diff(&p, Some("HEAD"), None).unwrap();
        assert!(d.contains("README.md"));
        assert!(d.contains("-# test"));
        assert!(d.contains("+# changed"));
    }

    #[test]
    fn diff_empty_when_clean() {
        let (_d, p) = init_repo();
        let d = diff(&p, None, None).unwrap();
        assert!(d.is_empty());
    }

    #[test]
    fn not_a_repo_returns_typed_error() {
        let dir = TempDir::new().unwrap();
        let err = status(dir.path()).unwrap_err();
        assert!(matches!(err, GitError::NotARepo(_)));
    }

    #[test]
    fn missing_path_returns_not_a_repo() {
        let p = std::path::Path::new("/tmp/squad-git-does-not-exist-xyz");
        let err = status(p).unwrap_err();
        assert!(matches!(err, GitError::NotARepo(_)));
    }
}
