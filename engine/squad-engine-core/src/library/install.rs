//! Install primitives into `<home>/library/<kind>/<slug>/`.
//!
//! Detection order on the GitHub repo root: `SKILL.md` → `squad.json` → `mcp.json`.
//! First match wins. The repo URL is preserved in `.source.json` so the UI can
//! show provenance and the user can re-fetch.

use super::{item_dir, InstallFromUrlResponse, LibraryItem, LibraryKind};
use crate::error::{CoreError, CoreResult};
use crate::store::{fetch_github_raw, parse_github_ref};
use std::fs;
use std::path::Path;

pub async fn install_from_url(
    home: &Path,
    url: &str,
) -> CoreResult<InstallFromUrlResponse> {
    let (owner, repo) = parse_github_ref(url)?;

    if let Some(bytes) = fetch_github_raw(&owner, &repo, "SKILL.md").await? {
        let (slug, item) = install_skill_bytes(home, &owner, &repo, &bytes)?;
        let path = item_dir(home, LibraryKind::Skill, &slug);
        return Ok(InstallFromUrlResponse {
            kind: LibraryKind::Skill,
            slug,
            item,
            path,
        });
    }

    if let Some(bytes) = fetch_github_raw(&owner, &repo, "squad.json").await? {
        let (slug, item) = install_role_bytes(home, &owner, &repo, &bytes).await?;
        let path = item_dir(home, LibraryKind::Role, &slug);
        return Ok(InstallFromUrlResponse {
            kind: LibraryKind::Role,
            slug,
            item,
            path,
        });
    }

    if let Some(bytes) = fetch_github_raw(&owner, &repo, "mcp.json").await? {
        let (slug, item) = install_mcp_bytes(home, &owner, &repo, &bytes)?;
        let path = item_dir(home, LibraryKind::Mcp, &slug);
        return Ok(InstallFromUrlResponse {
            kind: LibraryKind::Mcp,
            slug,
            item,
            path,
        });
    }

    Err(CoreError::BadRequest(format!(
        "no SKILL.md, squad.json or mcp.json found at root of {owner}/{repo}"
    )))
}

pub(super) fn install_skill_bytes(
    home: &Path,
    owner: &str,
    repo: &str,
    bytes: &[u8],
) -> CoreResult<(String, LibraryItem)> {
    let content = std::str::from_utf8(bytes)
        .map_err(|e| CoreError::BadRequest(format!("SKILL.md is not UTF-8: {e}")))?;
    let (summary, _body) = squad_skills::format::parse_content(content)
        .map_err(|e| CoreError::BadRequest(format!("SKILL.md parse failed: {e}")))?;

    let slug = sanitize_slug(&summary.name)?;
    let dir = item_dir(home, LibraryKind::Skill, &slug);
    if dir.exists() {
        return Err(CoreError::Conflict(format!(
            "library skill '{slug}' already exists"
        )));
    }
    fs::create_dir_all(&dir)?;
    fs::write(dir.join("SKILL.md"), content)?;

    let (installed_at, source_url) = write_source(&dir, owner, repo)?;

    Ok((
        slug.clone(),
        LibraryItem {
            kind: LibraryKind::Skill,
            slug,
            name: summary.name,
            description: summary.description,
            source_url: Some(source_url),
            installed_at,
            verified: false,
            image: summary.image,
            integrations: summary.integrations,
        },
    ))
}

pub(super) async fn install_role_bytes(
    home: &Path,
    owner: &str,
    repo: &str,
    bytes: &[u8],
) -> CoreResult<(String, LibraryItem)> {
    let config: serde_json::Value = serde_json::from_slice(bytes)
        .map_err(|e| CoreError::BadRequest(format!("squad.json parse failed: {e}")))?;
    let raw_id = config["id"]
        .as_str()
        .ok_or_else(|| CoreError::BadRequest("squad.json missing 'id' field".into()))?;
    let slug = sanitize_slug(raw_id)?;

    let dir = item_dir(home, LibraryKind::Role, &slug);
    if dir.exists() {
        return Err(CoreError::Conflict(format!(
            "library role '{slug}' already exists"
        )));
    }
    fs::create_dir_all(&dir)?;
    fs::write(dir.join("squad.json"), bytes)?;

    if let Some(claude_bytes) = fetch_github_raw(owner, repo, "CLAUDE.md").await? {
        fs::write(dir.join("CLAUDE.md"), claude_bytes)?;
    }

    let (installed_at, source_url) = write_source(&dir, owner, repo)?;

    Ok((
        slug.clone(),
        LibraryItem {
            kind: LibraryKind::Role,
            slug: slug.clone(),
            name: config["name"].as_str().unwrap_or(&slug).to_string(),
            description: config["description"].as_str().unwrap_or("").to_string(),
            source_url: Some(source_url),
            installed_at,
            verified: false,
            image: config["icon"].as_str().map(|s| s.to_string()),
            integrations: Vec::new(),
        },
    ))
}

pub(super) fn install_mcp_bytes(
    home: &Path,
    owner: &str,
    repo: &str,
    bytes: &[u8],
) -> CoreResult<(String, LibraryItem)> {
    let config: serde_json::Value = serde_json::from_slice(bytes)
        .map_err(|e| CoreError::BadRequest(format!("mcp.json parse failed: {e}")))?;

    let name = config["name"]
        .as_str()
        .ok_or_else(|| CoreError::BadRequest("mcp.json missing 'name' field".into()))?;
    if config["command"].as_str().is_none() {
        return Err(CoreError::BadRequest(
            "mcp.json missing 'command' field".into(),
        ));
    }
    let slug = sanitize_slug(name)?;

    let dir = item_dir(home, LibraryKind::Mcp, &slug);
    if dir.exists() {
        return Err(CoreError::Conflict(format!(
            "library mcp '{slug}' already exists"
        )));
    }
    fs::create_dir_all(&dir)?;
    fs::write(dir.join("mcp.json"), bytes)?;

    let (installed_at, source_url) = write_source(&dir, owner, repo)?;

    Ok((
        slug.clone(),
        LibraryItem {
            kind: LibraryKind::Mcp,
            slug,
            name: name.to_string(),
            description: config["description"].as_str().unwrap_or("").to_string(),
            source_url: Some(source_url),
            installed_at,
            verified: false,
            image: None,
            integrations: Vec::new(),
        },
    ))
}

fn write_source(dir: &Path, owner: &str, repo: &str) -> CoreResult<(String, String)> {
    let installed_at = chrono::Utc::now().to_rfc3339();
    let source_url = format!("https://github.com/{owner}/{repo}");
    let source = serde_json::json!({
        "repo": format!("{owner}/{repo}"),
        "source_url": source_url,
        "installed_at": installed_at,
        "verified": false,
    });
    fs::write(
        dir.join(".source.json"),
        serde_json::to_string_pretty(&source)?,
    )?;
    Ok((installed_at, source_url))
}

/// Coerce a human name into a filesystem-safe kebab-style slug.
/// Non-alphanumeric (except `-` / `_`) collapses to `-`; leading/trailing
/// dashes are trimmed. Errors if the result is empty.
pub(super) fn sanitize_slug(name: &str) -> CoreResult<String> {
    let mut out = String::with_capacity(name.len());
    let mut last_dash = false;
    for c in name.trim().to_lowercase().chars() {
        if c.is_ascii_alphanumeric() || c == '_' {
            out.push(c);
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    let s = out.trim_matches('-').to_string();
    if s.is_empty() {
        return Err(CoreError::BadRequest(format!(
            "name '{name}' produces empty slug"
        )));
    }
    Ok(s)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn sanitize_basic() {
        assert_eq!(sanitize_slug("Review PR").unwrap(), "review-pr");
        assert_eq!(sanitize_slug("review-pr").unwrap(), "review-pr");
        assert_eq!(sanitize_slug("review_pr").unwrap(), "review_pr");
        assert_eq!(sanitize_slug("Review!! PR").unwrap(), "review-pr");
    }

    #[test]
    fn sanitize_rejects_empty() {
        assert!(sanitize_slug("").is_err());
        assert!(sanitize_slug("---").is_err());
        assert!(sanitize_slug("!!!").is_err());
    }

    #[test]
    fn install_skill_writes_disk() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path();
        let skill =
            "---\nname: review-pr\ndescription: Review a PR\n---\n\n## Procedure\nRead diff\n";

        let (slug, item) =
            install_skill_bytes(home, "acme", "review-pr", skill.as_bytes()).unwrap();

        assert_eq!(slug, "review-pr");
        assert_eq!(item.name, "review-pr");
        assert_eq!(item.description, "Review a PR");
        assert_eq!(
            item.source_url.as_deref(),
            Some("https://github.com/acme/review-pr")
        );
        assert!(!item.verified);

        let dir = item_dir(home, LibraryKind::Skill, "review-pr");
        assert!(dir.join("SKILL.md").exists());
        assert!(dir.join(".source.json").exists());
        let source = std::fs::read_to_string(dir.join(".source.json")).unwrap();
        assert!(source.contains("acme/review-pr"));
        assert!(source.contains("\"verified\": false"));
    }

    #[test]
    fn install_skill_rejects_duplicate() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path();
        let skill = "---\nname: dup\ndescription: d\n---\n\nbody\n";
        install_skill_bytes(home, "acme", "dup", skill.as_bytes()).unwrap();
        let err = install_skill_bytes(home, "acme", "dup", skill.as_bytes()).unwrap_err();
        assert!(matches!(err, CoreError::Conflict(_)));
    }

    #[test]
    fn install_skill_rejects_malformed() {
        let tmp = TempDir::new().unwrap();
        let err = install_skill_bytes(tmp.path(), "acme", "broken", b"not frontmatter")
            .unwrap_err();
        assert!(matches!(err, CoreError::BadRequest(_)));
    }

    #[test]
    fn install_mcp_requires_command() {
        let tmp = TempDir::new().unwrap();
        let mcp = br#"{"name": "test-mcp", "description": "no command"}"#;
        let err = install_mcp_bytes(tmp.path(), "acme", "test-mcp", mcp).unwrap_err();
        assert!(matches!(err, CoreError::BadRequest(_)));
    }

    #[test]
    fn install_mcp_happy_path() {
        let tmp = TempDir::new().unwrap();
        let mcp = br#"{"name": "linear-mcp", "description": "Linear via MCP", "command": "npx", "args": ["linear-mcp"]}"#;
        let (slug, item) = install_mcp_bytes(tmp.path(), "acme", "linear-mcp", mcp).unwrap();
        assert_eq!(slug, "linear-mcp");
        assert_eq!(item.name, "linear-mcp");
        assert_eq!(item.description, "Linear via MCP");
    }
}
