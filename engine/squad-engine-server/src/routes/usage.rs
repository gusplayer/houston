//! Per-session token + cost aggregation routes.
//!
//! - `GET /v1/workspaces/:id/usage?range=today|7d|30d|all` — workspace
//!   dashboard payload: totals, per-agent rollups, raw session rows.
//! - `GET /v1/agents/:agent_path/usage?range=...` — per-agent rollup.
//! - `GET /v1/agents/:agent_path/sessions/:key/usage?provider=anthropic` —
//!   one session's accumulated counters.
//! - `GET /v1/agents/:agent_path/sessions/:key/context-breakdown` — the
//!   inspector view: what disk files contribute to this agent's initial
//!   prompt, plus the live window-used figure from the most recent turn.
//!
//! `agent_path` is a single path segment and MUST be percent-encoded.
//! Workspace `id` is the workspace UUID from `workspaces.json`.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use squad_db::SessionUsageRow;
use squad_engine_core::sessions::resolve_agent_dir;
use squad_engine_core::workspaces;
use squad_engine_core::CoreError;
use squad_engine_protocol::{
    model_context_window, AgentUsageDto, ContextBlockDto, ContextBreakdownDto, SessionUsageDto,
    WorkspaceUsageDto,
};
use std::collections::BTreeMap;
use std::path::{Path as StdPath, PathBuf};
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route("/workspaces/:id/usage", get(workspace_usage))
        .route("/agents/:agent_path/usage", get(agent_usage))
        .route(
            "/agents/:agent_path/sessions/:key/usage",
            get(session_usage),
        )
        .route(
            "/agents/:agent_path/sessions/:key/context-breakdown",
            get(context_breakdown),
        )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RangeQuery {
    /// `today` (since UTC midnight today), `7d`, `30d`, or `all`. Default `all`.
    #[serde(default)]
    range: Option<String>,
}

fn since_iso_for_range(range: Option<&str>) -> String {
    let now = chrono::Utc::now();
    match range.unwrap_or("all") {
        "today" => now
            .date_naive()
            .and_hms_opt(0, 0, 0)
            .map(|naive| chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(naive, chrono::Utc).to_rfc3339())
            .unwrap_or_default(),
        "7d" => (now - chrono::Duration::days(7)).to_rfc3339(),
        "30d" => (now - chrono::Duration::days(30)).to_rfc3339(),
        _ => String::new(),
    }
}

fn row_to_dto(row: SessionUsageRow) -> SessionUsageDto {
    let context_window = row.last_model.as_deref().and_then(model_context_window);
    SessionUsageDto {
        session_key: row.session_key,
        provider: row.provider,
        agent_path: row.agent_path,
        workspace_id: row.workspace_id,
        input_tokens: row.input_tokens,
        output_tokens: row.output_tokens,
        cache_creation_input_tokens: row.cache_creation_input_tokens,
        cache_read_input_tokens: row.cache_read_input_tokens,
        cost_usd: row.cost_usd,
        turns: row.turns,
        last_window_tokens: row.last_window_tokens,
        last_model: row.last_model,
        context_window,
        started_at: row.started_at,
        last_turn_at: row.last_turn_at,
    }
}

fn empty_agent_usage(agent_path: &str) -> AgentUsageDto {
    AgentUsageDto {
        agent_path: agent_path.to_string(),
        sessions: 0,
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        cost_usd: 0.0,
        turns: 0,
    }
}

fn fold_into_agent(agg: &mut AgentUsageDto, row: &SessionUsageRow) {
    agg.sessions += 1;
    agg.input_tokens += row.input_tokens;
    agg.output_tokens += row.output_tokens;
    agg.cache_creation_input_tokens += row.cache_creation_input_tokens;
    agg.cache_read_input_tokens += row.cache_read_input_tokens;
    agg.cost_usd += row.cost_usd;
    agg.turns += row.turns;
}

async fn workspace_usage(
    State(st): State<Arc<ServerState>>,
    Path(id): Path<String>,
    Query(q): Query<RangeQuery>,
) -> Result<Json<WorkspaceUsageDto>, ApiError> {
    // Verify the workspace exists so a typo returns 404 instead of an
    // empty payload that looks like "you used nothing this period".
    let all = workspaces::list(st.engine.paths.docs())?;
    if !all.iter().any(|w| w.id == id) {
        return Err(CoreError::NotFound(format!("workspace {id}")).into());
    }

    let since = since_iso_for_range(q.range.as_deref());
    let rows = st
        .engine
        .db
        .list_workspace_usage(&id, &since)
        .await
        .map_err(|e| CoreError::Internal(format!("session_usage query: {e}")))?;

    let mut totals = empty_agent_usage("");
    let mut by_agent: BTreeMap<String, AgentUsageDto> = BTreeMap::new();
    for row in &rows {
        fold_into_agent(&mut totals, row);
        let entry = by_agent
            .entry(row.agent_path.clone())
            .or_insert_with(|| empty_agent_usage(&row.agent_path));
        fold_into_agent(entry, row);
    }

    let sessions: Vec<SessionUsageDto> = rows.into_iter().map(row_to_dto).collect();
    let mut agents: Vec<AgentUsageDto> = by_agent.into_values().collect();
    // Highest spend first — matches the dashboard layout.
    agents.sort_by(|a, b| {
        b.cost_usd
            .partial_cmp(&a.cost_usd)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(b.input_tokens.cmp(&a.input_tokens))
    });

    Ok(Json(WorkspaceUsageDto {
        workspace_id: id,
        since,
        totals,
        agents,
        sessions,
    }))
}

async fn agent_usage(
    State(st): State<Arc<ServerState>>,
    Path(agent_path): Path<String>,
    Query(q): Query<RangeQuery>,
) -> Result<Json<WorkspaceUsageDto>, ApiError> {
    let agent_dir = resolve_agent_dir(&st.engine.paths, &agent_path);
    let agent_path_resolved = agent_dir.to_string_lossy().to_string();
    let since = since_iso_for_range(q.range.as_deref());
    let rows = st
        .engine
        .db
        .list_agent_usage(&agent_path_resolved, &since)
        .await
        .map_err(|e| CoreError::Internal(format!("session_usage query: {e}")))?;

    let mut totals = empty_agent_usage(&agent_path_resolved);
    for row in &rows {
        fold_into_agent(&mut totals, row);
    }
    let sessions: Vec<SessionUsageDto> = rows.into_iter().map(row_to_dto).collect();
    let workspace_id = squad_engine_core::sessions::resolve_workspace_id(
        &st.engine.paths,
        &agent_dir,
    )
    .unwrap_or_default();

    Ok(Json(WorkspaceUsageDto {
        workspace_id,
        since,
        totals: totals.clone(),
        agents: vec![totals],
        sessions,
    }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionUsageQuery {
    /// `anthropic` | `openai`. Defaults to `anthropic`.
    #[serde(default)]
    provider: Option<String>,
}

async fn session_usage(
    State(st): State<Arc<ServerState>>,
    Path((_agent_path, key)): Path<(String, String)>,
    Query(q): Query<SessionUsageQuery>,
) -> Result<Json<Option<SessionUsageDto>>, ApiError> {
    let provider = q.provider.as_deref().unwrap_or("anthropic");
    let row = st
        .engine
        .db
        .get_session_usage(&key, provider)
        .await
        .map_err(|e| CoreError::Internal(format!("session_usage query: {e}")))?;
    Ok(Json(row.map(row_to_dto)))
}

async fn context_breakdown(
    State(st): State<Arc<ServerState>>,
    Path((agent_path, key)): Path<(String, String)>,
) -> Result<Json<ContextBreakdownDto>, ApiError> {
    let agent_dir = resolve_agent_dir(&st.engine.paths, &agent_path);
    let blocks = collect_context_blocks(&agent_dir);
    let total_chars: u64 = blocks.iter().map(|b| b.char_count).sum();
    let total_est_tokens: u64 = blocks.iter().map(|b| b.est_tokens).sum();

    // Pick the freshest live row regardless of provider so the bar reflects
    // whichever CLI the user just used. Anthropic first because that's the
    // default for new installs.
    let claude_row = st
        .engine
        .db
        .get_session_usage(&key, "anthropic")
        .await
        .map_err(|e| CoreError::Internal(format!("session_usage query: {e}")))?;
    let live = match claude_row {
        Some(row) => Some(row),
        None => st
            .engine
            .db
            .get_session_usage(&key, "openai")
            .await
            .map_err(|e| CoreError::Internal(format!("session_usage query: {e}")))?,
    };

    let (last_window_tokens, last_model, context_window) = match live {
        Some(row) => {
            let window = row.last_model.as_deref().and_then(model_context_window);
            (Some(row.last_window_tokens), row.last_model, window)
        }
        None => (None, None, None),
    };

    Ok(Json(ContextBreakdownDto {
        blocks,
        total_chars,
        total_est_tokens,
        last_window_tokens,
        last_model,
        context_window,
    }))
}

/// Scan the agent directory for files that the engine injects into the
/// initial system prompt. This is approximate — the source of truth is
/// `build_agent_context` in `engine/squad-engine-core/src/agents/prompt.rs`.
/// We list the high-value files so users understand *why* their context
/// window fills up; we do not try to recompute the exact prompt the model
/// will see (tools, MCP definitions, runtime tool results are excluded).
fn collect_context_blocks(agent_dir: &PathBuf) -> Vec<ContextBlockDto> {
    let mut out = Vec::new();

    push_file_block(&mut out, agent_dir, "CLAUDE.md", "claude_md", "Agent instructions (CLAUDE.md)");

    // Learnings — count by summing the text field of every entry.
    let learnings_path = agent_dir.join(".squad/learnings/learnings.json");
    if let Ok(raw) = std::fs::read_to_string(&learnings_path) {
        if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(&raw) {
            let chars: u64 = arr
                .iter()
                .filter_map(|v| v.get("text").and_then(|t| t.as_str()))
                .map(|s| s.chars().count() as u64)
                .sum();
            if chars > 0 {
                out.push(ContextBlockDto {
                    source: "learnings".into(),
                    title: "Persistent learnings".into(),
                    char_count: chars,
                    est_tokens: chars / 4,
                });
            }
        }
    }

    // Skills index — sum SKILL.md sizes.
    let skills_dir = agent_dir.join(".agents/skills");
    let mut skill_chars: u64 = 0;
    if let Ok(entries) = std::fs::read_dir(&skills_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let skill_md = if path.is_dir() {
                path.join("SKILL.md")
            } else {
                path
            };
            if let Ok(meta) = std::fs::metadata(&skill_md) {
                skill_chars += meta.len();
            }
        }
    }
    if skill_chars > 0 {
        out.push(ContextBlockDto {
            source: "skills_index".into(),
            title: "Skills index".into(),
            char_count: skill_chars,
            est_tokens: skill_chars / 4,
        });
    }

    push_file_block(&mut out, agent_dir, ".squad/integrations.json", "integrations", "Composio integrations");
    push_file_block(&mut out, agent_dir, ".squad/mcps/mcps.json", "mcps", "MCP servers");

    // Workspace + agent docs from `.squad/docs/*.md`.
    push_docs_in(&mut out, agent_dir, "agent_doc", "Agent doc");
    if let Some(workspace_dir) = agent_dir.parent() {
        push_docs_in(&mut out, &workspace_dir.to_path_buf(), "workspace_doc", "Workspace doc");
    }

    out
}

fn push_file_block(
    out: &mut Vec<ContextBlockDto>,
    base: &StdPath,
    rel: &str,
    source: &str,
    title: &str,
) {
    let path = base.join(rel);
    if let Ok(meta) = std::fs::metadata(&path) {
        let chars = meta.len();
        if chars > 0 {
            out.push(ContextBlockDto {
                source: source.into(),
                title: title.into(),
                char_count: chars,
                est_tokens: chars / 4,
            });
        }
    }
}

fn push_docs_in(out: &mut Vec<ContextBlockDto>, root: &PathBuf, source_prefix: &str, title_prefix: &str) {
    let docs_dir = root.join(".squad/docs");
    let index_path = docs_dir.join("index.json");
    let Ok(raw) = std::fs::read_to_string(&index_path) else {
        return;
    };
    let Ok(index) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return;
    };
    let Some(slugs) = index.get("slugs").and_then(|v| v.as_array()) else {
        return;
    };
    for slug_val in slugs {
        let Some(slug) = slug_val.as_str() else {
            continue;
        };
        let path = docs_dir.join(format!("{slug}.md"));
        if let Ok(meta) = std::fs::metadata(&path) {
            let chars = meta.len();
            if chars > 0 {
                out.push(ContextBlockDto {
                    source: format!("{source_prefix}:{slug}"),
                    title: format!("{title_prefix}: {slug}"),
                    char_count: chars,
                    est_tokens: chars / 4,
                });
            }
        }
    }
}
