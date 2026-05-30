//! CRUD operations for `.squad/activity/activity.json`.

use super::store::{read_json, write_json};
use super::types::{Activity, ActivityUpdate, NewActivity};
use crate::error::{CoreError, CoreResult};
use chrono::Utc;
use std::collections::HashSet;
use std::path::Path;
use uuid::Uuid;

const FILE: &str = "activity";

pub fn list(root: &Path) -> CoreResult<Vec<Activity>> {
    read_json::<Vec<Activity>>(root, FILE)
}

pub fn create(root: &Path, input: NewActivity) -> CoreResult<Activity> {
    let mut items = list(root)?;
    let now = Utc::now().to_rfc3339();
    // Every activity is bound to a session via the convention
    // `activity-{id}`. Storing this on the row lets
    // `sessions::start` and `set_status_by_session_key` find the row
    // without needing the caller to pass both IDs. Without this, any
    // attempt to flip status from the session lifecycle silently
    // no-ops — which is what left agents stuck on "needs_you" even
    // while a new session was actively streaming.
    let id = Uuid::new_v4().to_string();
    let session_key = format!("activity-{id}");
    let item = Activity {
        id,
        title: input.title,
        description: input.description,
        status: "running".to_string(),
        claude_session_id: None,
        session_key: Some(session_key),
        agent: input.agent,
        worktree_path: input.worktree_path,
        routine_id: None,
        routine_run_id: None,
        updated_at: Some(now),
        provider: input.provider,
        model: input.model,
    };
    items.push(item.clone());
    write_json(root, FILE, &items)?;
    Ok(item)
}

pub fn update(root: &Path, id: &str, updates: ActivityUpdate) -> CoreResult<Activity> {
    let mut items = list(root)?;
    let item = items
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or_else(|| CoreError::NotFound(format!("activity {id}")))?;

    if let Some(title) = updates.title {
        item.title = title;
    }
    if let Some(description) = updates.description {
        item.description = description;
    }
    if let Some(status) = updates.status {
        item.status = status;
    }
    if let Some(session_id) = updates.claude_session_id {
        item.claude_session_id = session_id;
    }
    if let Some(session_key) = updates.session_key {
        item.session_key = Some(session_key);
    }
    if let Some(agent) = updates.agent {
        item.agent = Some(agent);
    }
    if let Some(worktree_path) = updates.worktree_path {
        item.worktree_path = worktree_path;
    }
    if let Some(routine_id) = updates.routine_id {
        item.routine_id = Some(routine_id);
    }
    if let Some(routine_run_id) = updates.routine_run_id {
        item.routine_run_id = Some(routine_run_id);
    }
    if let Some(provider) = updates.provider {
        item.provider = Some(provider);
    }
    if let Some(model) = updates.model {
        item.model = Some(model);
    }

    item.updated_at = Some(Utc::now().to_rfc3339());

    let result = item.clone();
    write_json(root, FILE, &items)?;
    Ok(result)
}

pub fn delete(root: &Path, id: &str) -> CoreResult<()> {
    let mut items = list(root)?;
    let before = items.len();
    items.retain(|t| t.id != id);
    if items.len() == before {
        return Err(CoreError::NotFound(format!("activity {id}")));
    }
    write_json(root, FILE, &items)
}

/// Set the status of the activity bound to `session_key`. Returns
/// `Ok(Some(activity))` if an activity was found and updated, `Ok(None)`
/// if no activity matches the session key (e.g. ad-hoc chat session
/// with no board item).
///
/// Matching order:
///   1. Exact match on the `session_key` field.
///   2. The "activity-{id}" convention — any older activity created
///      before `session_key` was persisted still has its id reachable
///      this way. Without this fallback, every legacy / onboarding row
///      would be stuck on whatever status it booted with forever.
///
/// Used by `sessions::start` so any client that kicks off a session —
/// desktop, mobile, or a third-party frontend — gets consistent
/// "Running" state on the board without each client having to write
/// the activity file themselves.
pub fn set_status_by_session_key(
    root: &Path,
    session_key: &str,
    status: &str,
) -> CoreResult<Option<Activity>> {
    let mut items = list(root)?;
    let implied_id = session_key.strip_prefix("activity-");
    let Some(item) = items.iter_mut().find(|t| {
        t.session_key.as_deref() == Some(session_key) || implied_id.is_some_and(|id| t.id == id)
    }) else {
        return Ok(None);
    };
    // Opportunistically heal legacy rows: if we matched via the id
    // convention but the session_key field was empty, backfill it so
    // future lookups hit the fast path.
    if item.session_key.as_deref() != Some(session_key) {
        item.session_key = Some(session_key.to_string());
    }
    if item.status == status {
        let result = item.clone();
        write_json(root, FILE, &items)?;
        return Ok(Some(result));
    }
    item.status = status.to_string();
    item.updated_at = Some(Utc::now().to_rfc3339());
    let result = item.clone();
    write_json(root, FILE, &items)?;
    Ok(Some(result))
}

/// Flip every xterm activity card to "done" that isn't already in a terminal
/// state (`done` / `cancelled` / `error`). This is the file-based fallback the
/// PTY kill route uses so the user's "Done" click ALWAYS moves the card to
/// the Done column — even when in-memory xterm tracking was lost (e.g. the
/// engine restarted between conversation start and the click). Returns the
/// number of cards changed so the caller can decide whether to emit
/// `ActivityChanged`.
pub fn finish_pending_xterm(root: &Path) -> CoreResult<usize> {
    let mut items = list(root)?;
    let now = Utc::now().to_rfc3339();
    let mut changed = 0;
    for item in items.iter_mut() {
        let is_xterm = item.agent.as_deref() == Some("xterm");
        let is_terminal_state = matches!(item.status.as_str(), "done" | "cancelled" | "error");
        if is_xterm && !is_terminal_state {
            item.status = "done".to_string();
            item.updated_at = Some(now.clone());
            changed += 1;
        }
    }
    if changed > 0 {
        write_json(root, FILE, &items)?;
    }
    Ok(changed)
}

/// Flip every non-terminal card to "done", regardless of source agent.
/// Called from the explicit PTY-kill ("Done") path so chat-originated cards
/// stuck on `needs_you` also close out when the user says "I'm done with
/// this agent". The user pressed Done after seeing the agent finish — the
/// intent is to wrap up the agent's whole current activity, not just the
/// PTY-spawned slice of it.
///
/// Returns the number of cards changed so the caller can decide whether to
/// emit an `ActivityChanged` event.
pub fn finalize_all_pending(root: &Path) -> CoreResult<usize> {
    let mut items = list(root)?;
    let now = Utc::now().to_rfc3339();
    let mut changed = 0;
    for item in items.iter_mut() {
        let is_terminal_state = matches!(item.status.as_str(), "done" | "cancelled" | "error");
        if !is_terminal_state {
            item.status = "done".to_string();
            item.updated_at = Some(now.clone());
            changed += 1;
        }
    }
    if changed > 0 {
        write_json(root, FILE, &items)?;
    }
    Ok(changed)
}

/// Flip stale xterm cards stuck on "running" to "needs_you", skipping any
/// whose `session_key` is in `tracked_keys` (sessions the ingest is actively
/// managing this engine run). xterm "running" liveness lives in the ingest's
/// in-memory state, so cards left over from a previous engine run never get
/// flipped and keep their "running" glow forever. Called on agent
/// registration to clear them. Returns the number changed.
pub fn demote_stale_xterm_running(
    root: &Path,
    tracked_keys: &HashSet<String>,
) -> CoreResult<usize> {
    let mut items = list(root)?;
    let now = Utc::now().to_rfc3339();
    let mut changed = 0;
    for item in items.iter_mut() {
        let is_xterm = item.agent.as_deref() == Some("xterm");
        let is_running = item.status == "running";
        let tracked = item
            .session_key
            .as_deref()
            .is_some_and(|k| tracked_keys.contains(k));
        if is_xterm && is_running && !tracked {
            item.status = "needs_you".to_string();
            item.updated_at = Some(now.clone());
            changed += 1;
        }
    }
    if changed > 0 {
        write_json(root, FILE, &items)?;
    }
    Ok(changed)
}
