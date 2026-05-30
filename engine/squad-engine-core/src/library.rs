//! User-owned library of primitives that can be assigned to agents.
//!
//! Lives at `<home>/library/<kind>/<slug>/` (global across all workspaces).
//! Three kinds today: `skill`, `role`, `mcp`. Skills install fully in M1;
//! role + MCP detection are wired so `install_from_url` does not silently
//! drop them, but their `copy_to_agent` paths return BadRequest until M2/M4.
//!
//! Discovery is community-driven via GitHub: anyone who pushes a repo with
//! the right contents at the root (`SKILL.md` / `squad.json` / `mcp.json`)
//! can be installed with `POST /v1/library/install-from-url`. No
//! curation server. The `verified` flag is reserved for a future
//! verified-publisher program (Vercel / Anthropic-style).

use crate::error::{CoreError, CoreResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub mod access;
pub mod install;

// ── Types ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LibraryKind {
    Skill,
    Role,
    Mcp,
}

impl LibraryKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Skill => "skill",
            Self::Role => "role",
            Self::Mcp => "mcp",
        }
    }

    pub fn parse(s: &str) -> CoreResult<Self> {
        match s {
            "skill" => Ok(Self::Skill),
            "role" => Ok(Self::Role),
            "mcp" => Ok(Self::Mcp),
            other => Err(CoreError::BadRequest(format!("unknown library kind: {other}"))),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItem {
    pub kind: LibraryKind,
    pub slug: String,
    pub name: String,
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_url: Option<String>,
    pub installed_at: String,
    /// Reserved for the future verified-publisher program (Vercel /
    /// Anthropic-style). Defaults to false on every install.
    #[serde(default)]
    pub verified: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub integrations: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallFromUrlRequest {
    pub url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallFromUrlResponse {
    pub kind: LibraryKind,
    pub slug: String,
    pub item: LibraryItem,
    pub path: PathBuf,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyToAgentRequest {
    pub agent_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyToAgentResponse {
    pub target_path: PathBuf,
}

// ── Paths ──────────────────────────────────────────────────────────

pub fn library_root(home: &Path) -> PathBuf {
    home.join("library")
}

pub fn kind_dir(home: &Path, kind: LibraryKind) -> PathBuf {
    library_root(home).join(kind.as_str())
}

pub fn item_dir(home: &Path, kind: LibraryKind, slug: &str) -> PathBuf {
    kind_dir(home, kind).join(slug)
}

// ── Public API (delegates) ─────────────────────────────────────────

pub async fn install_from_url(
    home: &Path,
    url: &str,
) -> CoreResult<InstallFromUrlResponse> {
    install::install_from_url(home, url).await
}

pub fn list_kind(home: &Path, kind: LibraryKind) -> CoreResult<Vec<LibraryItem>> {
    access::list_kind(home, kind)
}

pub fn read_item(
    home: &Path,
    kind: LibraryKind,
    slug: &str,
) -> CoreResult<LibraryItem> {
    access::read_item(home, kind, slug)
}

pub fn copy_to_agent(
    home: &Path,
    kind: LibraryKind,
    slug: &str,
    agent_root: &Path,
) -> CoreResult<PathBuf> {
    access::copy_to_agent(home, kind, slug, agent_root)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn kind_roundtrip() {
        for k in [LibraryKind::Skill, LibraryKind::Role, LibraryKind::Mcp] {
            assert_eq!(LibraryKind::parse(k.as_str()).unwrap(), k);
        }
        assert!(LibraryKind::parse("nope").is_err());
    }

    #[test]
    fn paths_layout() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path();
        assert_eq!(library_root(home), home.join("library"));
        assert_eq!(kind_dir(home, LibraryKind::Skill), home.join("library/skill"));
        assert_eq!(kind_dir(home, LibraryKind::Mcp), home.join("library/mcp"));
        assert_eq!(
            item_dir(home, LibraryKind::Skill, "foo"),
            home.join("library/skill/foo")
        );
    }
}
