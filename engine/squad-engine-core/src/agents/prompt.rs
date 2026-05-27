//! Agent directory helpers used to assemble the system prompt and seed
//! template files.
//!
//! Relocated from `app/squad-tauri/src/agent.rs` and
//! `app/src-tauri/src/agent.rs` as part of the engine standalone migration.
//! Transport-neutral — the Tauri adapter, REST routes, and tests all consume
//! the same functions.

use serde::Serialize;
use std::fs;
use std::path::Path;

/// Seed a single file into a directory if it doesn't already exist.
/// Never overwrites user edits.
pub fn seed_file(dir: &Path, name: &str, content: &str) -> Result<(), String> {
    let path = dir.join(name);
    if !path.exists() {
        fs::write(&path, content).map_err(|e| format!("Failed to write {name}: {e}"))?;
    }
    Ok(())
}

/// Build a system prompt by reading agent files and assembling them.
///
/// - `base_prompt`: The base identity prompt (always included first).
/// - `bootstrap_name`: If this file exists, it's injected prominently as a
///   first-run signal.
/// - `files`: List of `(filename, section_label)` to read and inject.
pub fn build_system_prompt(
    dir: &Path,
    base_prompt: &str,
    bootstrap_name: Option<&str>,
    files: &[(&str, &str)],
) -> String {
    let mut sections = vec![base_prompt.to_string()];

    if let Some(name) = bootstrap_name {
        if let Ok(content) = fs::read_to_string(dir.join(name)) {
            sections.push(format!(
                "# FIRST RUN — BOOTSTRAP\n\
                 {name} exists. This is your first time. Follow it EXACTLY.\n\n\
                 {content}"
            ));
        }
    }

    for (name, label) in files {
        if let Ok(content) = fs::read_to_string(dir.join(name)) {
            sections.push(format!("# {label}\n\n{content}"));
        }
    }

    sections.join("\n\n---\n\n")
}

/// Info about an agent file for UI display.
#[derive(Serialize)]
pub struct AgentFileInfo {
    pub name: String,
    pub description: String,
    pub exists: bool,
}

/// List known agent files with their existence status.
pub fn list_files(dir: &Path, known: &[(&str, &str)]) -> Vec<AgentFileInfo> {
    known
        .iter()
        .map(|(name, desc)| AgentFileInfo {
            name: name.to_string(),
            description: desc.to_string(),
            exists: dir.join(name).exists(),
        })
        .collect()
}

/// Read an agent file, only allowing known file names.
pub fn read_file(dir: &Path, name: &str, allowed: &[&str]) -> Result<String, String> {
    if !allowed.contains(&name) {
        return Err(format!("Unknown agent file: {name}"));
    }
    fs::read_to_string(dir.join(name)).map_err(|e| format!("Failed to read {name}: {e}"))
}

// ---------------------------------------------------------------------------
// Houston-flavored seed + system prompt (used by sessions::start*).
// ---------------------------------------------------------------------------

/// Default CLAUDE.md content for a brand-new agent.
pub const DEFAULT_CLAUDE_MD: &str = r#"# Houston Agent

## Role
You are a helpful AI assistant.

## Rules
- Be concise and direct
- Ask before making destructive changes
- Explain your reasoning when making decisions
"#;

/// Seed the Houston agent skeleton into an agent directory.
///
/// Creates `CLAUDE.md` (user-editable job description) and the
/// `.squad/prompts/modes/` directory for per-mode overrides. Does **not**
/// seed any product-layer prompt files — those live in the app process and
/// arrive via the engine's config (e.g. `SQUAD_APP_SYSTEM_PROMPT`).
pub fn seed_agent(dir: &Path) -> Result<(), String> {
    seed_file(dir, "CLAUDE.md", DEFAULT_CLAUDE_MD)?;

    let agents_md = dir.join("AGENTS.md");
    if !agents_md.exists() {
        #[cfg(unix)]
        {
            let _ = std::os::unix::fs::symlink("CLAUDE.md", &agents_md);
        }
        #[cfg(windows)]
        {
            let _ = std::os::windows::fs::symlink_file("CLAUDE.md", &agents_md);
        }
    }

    let prompts_dir = dir.join(".squad/prompts");
    let modes_dir = prompts_dir.join("modes");
    fs::create_dir_all(&modes_dir)
        .map_err(|e| format!("Failed to create .squad/prompts/modes: {e}"))?;

    if let Err(e) = squad_agent_files::migrate_agent_data(dir) {
        tracing::warn!("[agent] migration failed for {}: {e}", dir.display());
    }

    Ok(())
}

/// Build the per-agent context block the engine assembles from disk.
///
/// Transport-neutral and product-neutral: it is everything the engine knows
/// about the agent's filesystem layout (working dir, CLAUDE.md, mode file,
/// skills index, integrations list) and nothing about the Houston product
/// voice. Callers (typically the Houston app) prepend their own product
/// prompt before handing the result to the CLI subprocess.
pub fn build_agent_context(
    dir: &Path,
    working_dir_override: Option<&Path>,
    mode: Option<&str>,
) -> String {
    let mut parts: Vec<String> = Vec::new();
    let prompts_dir = dir.join(".squad/prompts");

    // Working directory framing depends on whether a real product repo
    // was handed in. With an override (e.g. session was launched against
    // a bound project): treat it as the strict sandbox.
    // Without an override: this is just the agent's identity folder.
    // Product code lives in the workspace projects listed in
    // "Projects in scope" further down, not here.
    let effective_dir = working_dir_override.unwrap_or(dir);
    let working_dir = effective_dir.to_string_lossy();
    if working_dir_override.is_some() {
        parts.push(format!(
            "# Working Directory — MANDATORY\n\n\
             Your working directory is: `{working_dir}`\n\n\
             **CRITICAL RULES:**\n\
             - ALL files you create, read, or modify MUST be within this directory.\n\
             - NEVER create files outside this directory (not in ~/, ~/.agents/, ~/Development/, /tmp/, or anywhere else).\n\
             - Skills go in `.agents/skills/` (relative to this directory).\n\
             - Squad data goes in `.squad/` (relative to this directory).\n\
             - If you need a new file or folder, create it HERE.\n\
             - When referencing paths, always use paths relative to or inside `{working_dir}`."
        ));
    } else {
        parts.push(format!(
            "# Agent Identity Directory\n\n\
             Your identity directory is: `{working_dir}`\n\n\
             **This is where YOUR data lives** — skills, learnings, \
             conversations, configuration. It is NOT a product codebase.\n\n\
             - Your own files (skills, learnings, configuration) live here \
               under `.squad/` and `.agents/skills/`.\n\
             - **Product source code lives in workspace projects** — see \
               \"Projects in scope\" below. When the user asks you to read \
               or modify code, operate inside those project paths, not here.\n\
             - If the user asks \"what project are you working on?\", answer \
               by referencing the workspace projects, not this identity \
               folder."
        ));
    }

    if let Some(m) = mode {
        let mode_path = prompts_dir.join(format!("modes/{m}.md"));
        let fallback_path = prompts_dir.join(format!("{m}.md"));
        if let Ok(content) =
            fs::read_to_string(&mode_path).or_else(|_| fs::read_to_string(&fallback_path))
        {
            parts.push(content);
        } else {
            tracing::warn!("[agent] mode file not found: {m}.md");
        }
    }

    if let Some(learnings) = super::learnings_context::build_learnings_context(dir) {
        parts.push(learnings);
    }

    let skills_dir = dir.join(".agents/skills");
    if let Ok(index) = squad_skills::build_skills_index(&skills_dir) {
        if !index.is_empty() {
            parts.push(index);
        }
    }

    let integrations_path = dir.join(".squad/integrations.json");
    if let Ok(content) = fs::read_to_string(&integrations_path) {
        let names: Vec<String> = serde_json::from_str::<Vec<serde_json::Value>>(&content)
            .ok()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.get("toolkit").and_then(|t| t.as_str()).map(String::from))
                    .collect()
            })
            .or_else(|| {
                serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&content)
                    .ok()
                    .map(|map| map.keys().cloned().collect())
            })
            .unwrap_or_default();

        if !names.is_empty() {
            parts.push(format!(
                "# Integrations — Previously Used\n\n\
                 You have used these Composio integrations in past sessions: {}.\n\
                 Prefer these when the task involves their services.",
                names.join(", ")
            ));
        }
    }

    // Projects in scope: list the workspace projects this agent can
    // operate on so the agent stops confusing its identity folder (where
    // its own data lives) with the actual product repo. CTO mode (no
    // bindings) gets every workspace project; specialist mode gets only
    // the bound subset.
    if let Some(projects_block) = build_projects_in_scope(dir) {
        parts.push(projects_block);
    }

    // Project-scoped docs (M1/M2 cascade): for each project the agent can
    // see, inject CLAUDE.md / Rules / Architecture if the user wrote any.
    // These sit between workspace docs and agent docs in the cascade.
    if let Some(workspace_dir) = dir.parent() {
        let visible_ids = visible_project_ids(dir, workspace_dir);
        for project_id in visible_ids {
            for block in read_project_doc_blocks(workspace_dir, &project_id) {
                parts.push(block);
            }
        }
    }

    // Project docs (I.1): workspace-scoped docs filtered by audience +
    // per-agent private docs. The agent's role id comes from
    // `<agent>/.squad/agent.json` so audience-tagged docs only land in
    // the right roles' prompts (qa-criteria for Jeff, review-criteria
    // for Sam, Jane, and the leads).
    let role_id = read_role_id(dir);
    if let Some(workspace_dir) = dir.parent() {
        for d in read_docs_in(workspace_dir) {
            if d.body.trim().is_empty() {
                continue;
            }
            let matches = d.audience.is_empty()
                || role_id
                    .as_deref()
                    .map(|r| d.audience.iter().any(|a| a == r))
                    .unwrap_or(false);
            if matches {
                parts.push(format!("# Project Doc — {}\n\n{}", d.title, d.body));
            }
        }
    }
    for d in read_docs_in(dir) {
        if d.body.trim().is_empty() {
            continue;
        }
        parts.push(format!("# Agent Doc — {}\n\n{}", d.title, d.body));
    }

    parts.join("\n\n---\n\n")
}

// ── Project doc helpers ─────────────────────────────────────────────────

struct DocEntry {
    title: String,
    audience: Vec<String>,
    body: String,
}

/// Read the agent's role id from `<agent>/.squad/agent.json` so we can
/// audience-filter workspace docs. Returns None if the file is missing
/// or malformed; the caller treats that as "universal docs only".
fn read_role_id(agent_dir: &Path) -> Option<String> {
    let meta_path = agent_dir.join(".squad/agent.json");
    let content = fs::read_to_string(&meta_path).ok()?;
    let meta: serde_json::Value = serde_json::from_str(&content).ok()?;
    meta.get("config_id")?.as_str().map(String::from)
}

/// Read all docs from `<root>/.squad/docs/` using the index.json maintained
/// by the frontend. Quietly tolerates missing files, malformed JSON, and
/// stale index entries.
fn read_docs_in(root: &Path) -> Vec<DocEntry> {
    let docs_dir = root.join(".squad/docs");
    let index_path = docs_dir.join("index.json");

    let Ok(index_raw) = fs::read_to_string(&index_path) else {
        return Vec::new();
    };
    let Ok(index) = serde_json::from_str::<serde_json::Value>(&index_raw) else {
        return Vec::new();
    };
    let Some(slugs) = index.get("slugs").and_then(|v| v.as_array()) else {
        return Vec::new();
    };

    let mut out = Vec::new();
    for slug_val in slugs {
        let Some(slug) = slug_val.as_str() else {
            continue;
        };
        let path = docs_dir.join(format!("{slug}.md"));
        let Ok(raw) = fs::read_to_string(&path) else {
            continue;
        };
        if raw.is_empty() {
            continue;
        }
        out.push(parse_doc(&raw, slug));
    }
    out
}

/// Minimal YAML-ish frontmatter parser — keeps engine free of a YAML dep.
/// Matches the frontend's `parseFrontmatter` in `lib/project-docs.ts`.
fn parse_doc(raw: &str, slug: &str) -> DocEntry {
    let mut title = slug.to_string();
    let mut audience: Vec<String> = Vec::new();
    let mut body = raw.to_string();

    if let Some(rest) = raw.strip_prefix("---\n") {
        if let Some(end_idx) = rest.find("\n---") {
            let fm = &rest[..end_idx];
            for line in fm.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed.starts_with('#') {
                    continue;
                }
                let Some((k, v)) = trimmed.split_once(':') else {
                    continue;
                };
                let k = k.trim();
                let v = v.trim();
                if k == "title" {
                    title = v.trim_matches(|c| c == '"' || c == '\'').to_string();
                } else if k == "audience" && v.starts_with('[') && v.ends_with(']') {
                    audience = v[1..v.len() - 1]
                        .split(',')
                        .map(|s| s.trim().trim_matches(|c| c == '"' || c == '\'').to_string())
                        .filter(|s| !s.is_empty())
                        .collect();
                }
            }
            // Strip frontmatter (including the trailing "---\n") from body.
            let after = &rest[end_idx + 4..];
            body = after.trim_start_matches('\n').to_string();
        }
    }

    DocEntry {
        title,
        audience,
        body,
    }
}

// ── Projects-in-scope helpers ──────────────────────────────────────────

/// Read the agent's bound projectIds from `<agent>/.squad/config/config.json`.
/// Empty / unset means "see every workspace project" (CTO mode).
fn read_project_bindings(agent_dir: &Path) -> Vec<String> {
    let path = agent_dir.join(".squad/config/config.json");
    let Ok(raw) = fs::read_to_string(&path) else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return Vec::new();
    };
    let Some(arr) = value.get("projectIds").and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    arr.iter()
        .filter_map(|v| v.as_str().map(String::from))
        .collect()
}

/// Read workspace projects from `<workspace>/.squad/projects.json`.
/// Each entry is `{ id, name, repoPath, stack?, ... }`.
fn read_workspace_projects(workspace_dir: &Path) -> Vec<serde_json::Value> {
    let path = workspace_dir.join(".squad/projects.json");
    let Ok(raw) = fs::read_to_string(&path) else {
        return Vec::new();
    };
    serde_json::from_str::<Vec<serde_json::Value>>(&raw).unwrap_or_default()
}

/// Resolve the set of project ids visible to this agent: the bound
/// projectIds, or all workspace projects when bindings are empty (CTO
/// mode). Order is the workspace order so prompt assembly is deterministic.
fn visible_project_ids(agent_dir: &Path, workspace_dir: &Path) -> Vec<String> {
    let all = read_workspace_projects(workspace_dir);
    let bindings = read_project_bindings(agent_dir);
    all.into_iter()
        .filter_map(|p| p.get("id").and_then(|v| v.as_str()).map(String::from))
        .filter(|id| bindings.is_empty() || bindings.iter().any(|b| b == id))
        .collect()
}

/// Read all three project-scoped docs for one project and turn them into
/// labeled prompt blocks. Missing/empty docs are skipped silently — the
/// project may not have written any yet, which is fine.
fn read_project_doc_blocks(workspace_dir: &Path, project_id: &str) -> Vec<String> {
    let project_name = read_project_name(workspace_dir, project_id);
    let mut out = Vec::new();
    for doc in squad_projects::ProjectDoc::all() {
        let body = match squad_projects::read_doc(workspace_dir, project_id, doc) {
            Ok(Some(body)) => body,
            _ => continue,
        };
        out.push(format!(
            "# Project Doc — {} ({})\n\n{}",
            doc.label(),
            project_name.as_deref().unwrap_or(project_id),
            body,
        ));
    }
    out
}

fn read_project_name(workspace_dir: &Path, project_id: &str) -> Option<String> {
    read_workspace_projects(workspace_dir).into_iter().find_map(|p| {
        let id = p.get("id").and_then(|v| v.as_str())?;
        if id != project_id {
            return None;
        }
        p.get("name").and_then(|v| v.as_str()).map(String::from)
    })
}

/// Compose the "Projects in scope" prompt section, or None when the
/// workspace has no projects at all. Loud about the difference between
/// the agent's identity directory (this file lives here) and the actual
/// product repos (work happens there) because that's the failure mode
/// we just hit on first hands-on: agents naming their own folder as
/// "the project".
fn build_projects_in_scope(agent_dir: &Path) -> Option<String> {
    let workspace_dir = agent_dir.parent()?;
    let all = read_workspace_projects(workspace_dir);
    if all.is_empty() {
        return None;
    }

    let bindings = read_project_bindings(agent_dir);
    let visible: Vec<&serde_json::Value> = if bindings.is_empty() {
        all.iter().collect()
    } else {
        all.iter()
            .filter(|p| {
                p.get("id")
                    .and_then(|v| v.as_str())
                    .map(|id| bindings.iter().any(|b| b == id))
                    .unwrap_or(false)
            })
            .collect()
    };

    if visible.is_empty() {
        return None;
    }

    let mut lines = String::new();
    lines.push_str("# Projects in scope\n\n");
    lines.push_str(
        "These are the product repositories you can operate on. Use these \
         paths when running commands, reading source, or referencing files. \
         Do NOT confuse them with your agent identity folder \
         (where your own skills, learnings, and conversations live).\n\n",
    );

    for project in &visible {
        let name = project
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("(unnamed)");
        let repo_path = project
            .get("repoPath")
            .and_then(|v| v.as_str())
            .unwrap_or("(no path)");
        let stack = project.get("stack").and_then(|v| v.as_str());
        if let Some(s) = stack {
            lines.push_str(&format!("- **{name}** ({s}) — `{repo_path}`\n"));
        } else {
            lines.push_str(&format!("- **{name}** — `{repo_path}`\n"));
        }
    }

    if !bindings.is_empty() && visible.len() < all.len() {
        lines.push_str(
            "\nOther projects exist in this workspace but you are not bound \
             to them. Stay scoped to the list above unless the user explicitly \
             asks otherwise.",
        );
    } else if bindings.is_empty() && all.len() > 1 {
        lines.push_str(
            "\nYou are in CTO mode — every workspace project is visible. \
             When delegating, name the specific project so the specialist \
             knows where to work.",
        );
    }

    Some(lines)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn seed_file_is_write_once() {
        let d = TempDir::new().unwrap();
        seed_file(d.path(), "CLAUDE.md", "first").unwrap();
        seed_file(d.path(), "CLAUDE.md", "second").unwrap();
        assert_eq!(
            fs::read_to_string(d.path().join("CLAUDE.md")).unwrap(),
            "first"
        );
    }

    #[cfg(unix)]
    #[test]
    fn seed_agent_exposes_claude_md_to_codex() {
        let d = TempDir::new().unwrap();
        seed_agent(d.path()).unwrap();

        let agents_md = d.path().join("AGENTS.md");
        assert_eq!(fs::read_link(agents_md).unwrap(), Path::new("CLAUDE.md"));
    }

    #[test]
    fn build_system_prompt_assembles_known_sections() {
        let d = TempDir::new().unwrap();
        fs::write(d.path().join("BOOT.md"), "boot body").unwrap();
        fs::write(d.path().join("section.md"), "section body").unwrap();

        let out = build_system_prompt(
            d.path(),
            "BASE",
            Some("BOOT.md"),
            &[("section.md", "Section")],
        );
        assert!(out.contains("BASE"));
        assert!(out.contains("FIRST RUN — BOOTSTRAP"));
        assert!(out.contains("boot body"));
        assert!(out.contains("# Section"));
        assert!(out.contains("section body"));
    }

    #[test]
    fn build_agent_context_includes_learnings_snapshot() {
        let d = TempDir::new().unwrap();
        let learnings_dir = d.path().join(".squad/learnings");
        fs::create_dir_all(&learnings_dir).unwrap();
        fs::write(
            learnings_dir.join("learnings.json"),
            r#"[
                { "id": "one", "text": "User calls this contact Mr. Perkins.", "created_at": "2026-01-01T00:00:00Z" }
            ]"#,
        )
        .unwrap();

        let out = build_agent_context(d.path(), None, None);

        assert!(out.contains("# Persistent Learnings - Frozen Snapshot"));
        assert!(out.contains("User calls this contact Mr. Perkins."));
        assert!(!out.contains("2026-01-01"));
    }

    #[test]
    fn list_files_reports_existence() {
        let d = TempDir::new().unwrap();
        fs::write(d.path().join("present.md"), "x").unwrap();
        let out = list_files(
            d.path(),
            &[("present.md", "exists"), ("absent.md", "missing")],
        );
        assert_eq!(out.len(), 2);
        assert!(out[0].exists);
        assert!(!out[1].exists);
    }

    #[test]
    fn read_file_rejects_unknown_name() {
        let d = TempDir::new().unwrap();
        let err = read_file(d.path(), "../etc/passwd", &["allowed.md"]).unwrap_err();
        assert!(err.contains("Unknown agent file"));
    }

    #[test]
    fn parse_doc_extracts_title_audience_and_body() {
        let raw = "---\ntitle: \"QA criteria\"\naudience: [\"qa-agent\", \"cto-agent\"]\n---\n\n# QA\n\nbody here";
        let parsed = parse_doc(raw, "qa-criteria");
        assert_eq!(parsed.title, "QA criteria");
        assert_eq!(parsed.audience, vec!["qa-agent", "cto-agent"]);
        assert!(parsed.body.starts_with("# QA"));
    }

    #[test]
    fn parse_doc_handles_no_frontmatter() {
        let raw = "# Architecture\n\nsystem design here";
        let parsed = parse_doc(raw, "architecture");
        assert_eq!(parsed.title, "architecture");
        assert!(parsed.audience.is_empty());
        assert_eq!(parsed.body, raw);
    }

    #[test]
    fn build_agent_context_lists_projects_in_scope_and_reframes_identity_dir() {
        // Workspace with two projects. Agent has no bindings → CTO mode,
        // both projects appear. Identity directory framing kicks in
        // because we don't pass a working_dir_override.
        let ws = TempDir::new().unwrap();
        let agent_dir = ws.path().join("Peter");
        fs::create_dir_all(agent_dir.join(".squad/config")).unwrap();
        fs::create_dir_all(ws.path().join(".squad")).unwrap();
        fs::write(
            ws.path().join(".squad/projects.json"),
            r#"[
                {"id":"p1","name":"photoapp-rn","repoPath":"/repos/photoapp-rn","stack":"react-native"},
                {"id":"p2","name":"photoapp-backend","repoPath":"/repos/backend"}
            ]"#,
        )
        .unwrap();

        let out = build_agent_context(&agent_dir, None, None);
        assert!(out.contains("Agent Identity Directory"));
        assert!(out.contains("Projects in scope"));
        assert!(out.contains("photoapp-rn"));
        assert!(out.contains("/repos/photoapp-rn"));
        assert!(out.contains("photoapp-backend"));
        assert!(out.contains("CTO mode"));
    }

    #[test]
    fn build_agent_context_filters_projects_by_bindings() {
        let ws = TempDir::new().unwrap();
        let agent_dir = ws.path().join("Maya");
        fs::create_dir_all(agent_dir.join(".squad/config")).unwrap();
        fs::write(
            agent_dir.join(".squad/config/config.json"),
            r#"{"projectIds":["p1"]}"#,
        )
        .unwrap();
        fs::create_dir_all(ws.path().join(".squad")).unwrap();
        fs::write(
            ws.path().join(".squad/projects.json"),
            r#"[
                {"id":"p1","name":"photoapp-rn","repoPath":"/repos/photoapp-rn"},
                {"id":"p2","name":"photoapp-backend","repoPath":"/repos/backend"}
            ]"#,
        )
        .unwrap();

        let out = build_agent_context(&agent_dir, None, None);
        assert!(out.contains("photoapp-rn"));
        assert!(!out.contains("photoapp-backend"));
        // Bound mode shouldn't claim CTO mode.
        assert!(!out.contains("CTO mode"));
    }

    #[test]
    fn build_agent_context_injects_workspace_docs_audience_filtered() {
        // Workspace at /ws, agent at /ws/agent. Two docs: architecture
        // is universal, qa-criteria targets qa-agent only. Build for a
        // qa-agent → both included. Build for a cto-agent → only
        // architecture.
        let ws = TempDir::new().unwrap();
        let agent_dir = ws.path().join("agent");
        fs::create_dir_all(agent_dir.join(".squad")).unwrap();

        // Workspace docs
        let docs_dir = ws.path().join(".squad/docs");
        fs::create_dir_all(&docs_dir).unwrap();
        fs::write(
            docs_dir.join("index.json"),
            r#"{"slugs":["architecture","qa-criteria"]}"#,
        )
        .unwrap();
        fs::write(
            docs_dir.join("architecture.md"),
            "---\ntitle: \"Architecture\"\n---\n\nuniversal body",
        )
        .unwrap();
        fs::write(
            docs_dir.join("qa-criteria.md"),
            "---\ntitle: \"QA criteria\"\naudience: [\"qa-agent\"]\n---\n\nqa-only body",
        )
        .unwrap();

        // Agent meta — qa role
        fs::write(
            agent_dir.join(".squad/agent.json"),
            r#"{"id":"a1","config_id":"qa-agent","created_at":"2026-01-01T00:00:00Z"}"#,
        )
        .unwrap();

        let out = build_agent_context(&agent_dir, None, None);
        assert!(out.contains("universal body"));
        assert!(out.contains("qa-only body"));

        // Flip role: cto-agent should NOT see qa-criteria.
        fs::write(
            agent_dir.join(".squad/agent.json"),
            r#"{"id":"a1","config_id":"cto-agent","created_at":"2026-01-01T00:00:00Z"}"#,
        )
        .unwrap();
        let out = build_agent_context(&agent_dir, None, None);
        assert!(out.contains("universal body"));
        assert!(!out.contains("qa-only body"));
    }
}
