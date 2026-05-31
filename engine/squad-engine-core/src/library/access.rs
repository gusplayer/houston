//! List, read, and copy library items to agent roots.
//!
//! Copies are idempotent — if the target file already exists in the
//! agent's `.agents/skills/<slug>/SKILL.md`, the copy is skipped so
//! user edits win (mirrors the existing skill-sync rule).

use super::{item_dir, kind_dir, LibraryItem, LibraryKind};
use crate::error::{CoreError, CoreResult};
use std::fs;
use std::path::{Path, PathBuf};

pub fn list_kind(home: &Path, kind: LibraryKind) -> CoreResult<Vec<LibraryItem>> {
    let dir = kind_dir(home, kind);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut items = Vec::new();
    for entry in fs::read_dir(&dir)?.flatten() {
        let p = entry.path();
        if !p.is_dir() {
            continue;
        }
        let Some(slug) = p.file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        match read_item(home, kind, slug) {
            Ok(item) => items.push(item),
            Err(e) => tracing::warn!("[library] skipping {}: {e}", p.display()),
        }
    }
    items.sort_by(|a, b| a.slug.cmp(&b.slug));
    Ok(items)
}

pub fn read_item(
    home: &Path,
    kind: LibraryKind,
    slug: &str,
) -> CoreResult<LibraryItem> {
    let dir = item_dir(home, kind, slug);
    if !dir.exists() {
        return Err(CoreError::NotFound(format!(
            "library {} '{slug}'",
            kind.as_str()
        )));
    }

    let source: serde_json::Value = fs::read_to_string(dir.join(".source.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::Value::Null);
    let source_url = source["source_url"].as_str().map(|s| s.to_string());
    let installed_at = source["installed_at"].as_str().unwrap_or("").to_string();
    let verified = source["verified"].as_bool().unwrap_or(false);

    match kind {
        LibraryKind::Skill => {
            let content = fs::read_to_string(dir.join("SKILL.md"))?;
            let (summary, _) = squad_skills::format::parse_content(&content)
                .map_err(|e| CoreError::BadRequest(format!("malformed SKILL.md: {e}")))?;
            Ok(LibraryItem {
                kind,
                slug: slug.to_string(),
                name: summary.name,
                description: summary.description,
                source_url,
                installed_at,
                verified,
                image: summary.image,
                integrations: summary.integrations,
            })
        }
        LibraryKind::Role => {
            let json = fs::read_to_string(dir.join("squad.json"))?;
            let config: serde_json::Value = serde_json::from_str(&json)?;
            Ok(LibraryItem {
                kind,
                slug: slug.to_string(),
                name: config["name"].as_str().unwrap_or(slug).to_string(),
                description: config["description"].as_str().unwrap_or("").to_string(),
                source_url,
                installed_at,
                verified,
                image: config["icon"].as_str().map(|s| s.to_string()),
                integrations: Vec::new(),
            })
        }
        LibraryKind::Mcp => {
            let json = fs::read_to_string(dir.join("mcp.json"))?;
            let config: serde_json::Value = serde_json::from_str(&json)?;
            Ok(LibraryItem {
                kind,
                slug: slug.to_string(),
                name: config["name"].as_str().unwrap_or(slug).to_string(),
                description: config["description"].as_str().unwrap_or("").to_string(),
                source_url,
                installed_at,
                verified,
                image: None,
                integrations: Vec::new(),
            })
        }
    }
}

pub fn copy_to_agent(
    home: &Path,
    kind: LibraryKind,
    slug: &str,
    agent_root: &Path,
) -> CoreResult<PathBuf> {
    // Reject non-copyable kinds up front — independent of whether the
    // slug exists, so the user sees the conceptual error first.
    match kind {
        LibraryKind::Skill => {}
        LibraryKind::Mcp => {
            return Err(CoreError::BadRequest(
                "MCP assignment to an agent lands in M2".into(),
            ))
        }
        LibraryKind::Role => {
            return Err(CoreError::BadRequest(
                "roles are hired via the recruit dialog, not copied to an existing agent"
                    .into(),
            ))
        }
    }

    let src = item_dir(home, kind, slug);
    if !src.exists() {
        return Err(CoreError::NotFound(format!(
            "library {} '{slug}'",
            kind.as_str()
        )));
    }

    let target_dir = agent_root.join(".agents/skills").join(slug);
    let target_file = target_dir.join("SKILL.md");
    if target_file.exists() {
        // User edits win — don't overwrite. Idempotent.
        return Ok(target_dir);
    }
    fs::create_dir_all(&target_dir)?;
    fs::copy(src.join("SKILL.md"), &target_file)?;
    Ok(target_dir)
}

#[cfg(test)]
mod tests {
    use super::super::install::install_skill_bytes;
    use super::*;
    use tempfile::TempDir;

    fn write_skill(home: &Path) {
        let skill = "---\nname: review-pr\ndescription: Review a PR\n---\n\nbody\n";
        install_skill_bytes(home, "acme", "review-pr", skill.as_bytes()).unwrap();
    }

    #[test]
    fn list_empty_when_dir_missing() {
        let tmp = TempDir::new().unwrap();
        let result = list_kind(tmp.path(), LibraryKind::Skill).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn list_returns_installed_skill() {
        let tmp = TempDir::new().unwrap();
        write_skill(tmp.path());
        let items = list_kind(tmp.path(), LibraryKind::Skill).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].slug, "review-pr");
        assert_eq!(items[0].name, "review-pr");
    }

    #[test]
    fn read_item_not_found() {
        let tmp = TempDir::new().unwrap();
        let err = read_item(tmp.path(), LibraryKind::Skill, "ghost").unwrap_err();
        assert!(matches!(err, CoreError::NotFound(_)));
    }

    #[test]
    fn copy_skill_to_agent() {
        let home_tmp = TempDir::new().unwrap();
        let agent_tmp = TempDir::new().unwrap();
        write_skill(home_tmp.path());

        let target =
            copy_to_agent(home_tmp.path(), LibraryKind::Skill, "review-pr", agent_tmp.path())
                .unwrap();

        assert_eq!(target, agent_tmp.path().join(".agents/skills/review-pr"));
        assert!(target.join("SKILL.md").exists());
    }

    #[test]
    fn copy_is_idempotent_and_preserves_user_edits() {
        let home_tmp = TempDir::new().unwrap();
        let agent_tmp = TempDir::new().unwrap();
        write_skill(home_tmp.path());

        let first = copy_to_agent(
            home_tmp.path(),
            LibraryKind::Skill,
            "review-pr",
            agent_tmp.path(),
        )
        .unwrap();

        // User edits the skill in the agent root.
        let edited = "---\nname: review-pr\ndescription: my edit\n---\n\nedited body\n";
        fs::write(first.join("SKILL.md"), edited).unwrap();

        // Re-copy must NOT overwrite the user edit.
        let second = copy_to_agent(
            home_tmp.path(),
            LibraryKind::Skill,
            "review-pr",
            agent_tmp.path(),
        )
        .unwrap();
        let content = fs::read_to_string(second.join("SKILL.md")).unwrap();
        assert_eq!(content, edited);
    }

    #[test]
    fn copy_role_returns_bad_request() {
        let tmp = TempDir::new().unwrap();
        let err =
            copy_to_agent(tmp.path(), LibraryKind::Role, "any", tmp.path()).unwrap_err();
        assert!(matches!(err, CoreError::BadRequest(_)));
    }

    #[test]
    fn copy_mcp_returns_bad_request() {
        let tmp = TempDir::new().unwrap();
        let err =
            copy_to_agent(tmp.path(), LibraryKind::Mcp, "any", tmp.path()).unwrap_err();
        assert!(matches!(err, CoreError::BadRequest(_)));
    }

    #[test]
    fn copy_missing_slug_returns_not_found() {
        let tmp_home = TempDir::new().unwrap();
        let tmp_agent = TempDir::new().unwrap();
        let err = copy_to_agent(
            tmp_home.path(),
            LibraryKind::Skill,
            "ghost",
            tmp_agent.path(),
        )
        .unwrap_err();
        assert!(matches!(err, CoreError::NotFound(_)));
    }
}
