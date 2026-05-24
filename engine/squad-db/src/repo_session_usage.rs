//! CRUD for `session_usage`. One row per `(session_key, provider)` pair,
//! upserted on each turn the provider CLI reports usage for.
//!
//! Cumulative columns (`input_tokens`, `output_tokens`, `cache_*`, `cost_usd`,
//! `turns`) sum across every turn in the session — they represent the
//! lifetime spend. `last_window_tokens` is the most recent turn's combined
//! input (`input + cache_creation + cache_read`) — i.e. the context window
//! the model saw on that turn. The dashboard uses that figure to render
//! the "context window full" bar.

use crate::db::Database;
use anyhow::Result;

/// Numbers for a single chat session in one provider, aggregated across
/// every turn the CLI reported.
#[derive(Debug, Clone, PartialEq)]
pub struct SessionUsageRow {
    pub session_key: String,
    pub provider: String,
    pub agent_path: String,
    pub workspace_id: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_input_tokens: u64,
    pub cache_read_input_tokens: u64,
    pub cost_usd: f64,
    pub turns: u64,
    /// Combined input on the most recent turn (input + cache_creation +
    /// cache_read). The current "context window used" figure.
    pub last_window_tokens: u64,
    pub last_model: Option<String>,
    pub started_at: String,
    pub last_turn_at: String,
}

/// Inputs for one turn — added on top of any existing row.
#[derive(Debug, Clone)]
pub struct SessionUsageDelta<'a> {
    pub session_key: &'a str,
    pub provider: &'a str,
    pub agent_path: &'a str,
    pub workspace_id: &'a str,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_input_tokens: u64,
    pub cache_read_input_tokens: u64,
    pub cost_usd: f64,
    pub model: Option<&'a str>,
}

impl Database {
    /// Add one turn's usage to the (session, provider) row, or create the
    /// row if this is the first turn. `last_window_tokens` and `last_model`
    /// are overwritten with the new turn's values; everything else
    /// accumulates.
    pub async fn upsert_session_usage(&self, delta: SessionUsageDelta<'_>) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        let last_window = delta.input_tokens
            + delta.cache_creation_input_tokens
            + delta.cache_read_input_tokens;
        self.conn()
            .execute(
                "INSERT INTO session_usage (
                    session_key, provider, agent_path, workspace_id,
                    input_tokens, output_tokens,
                    cache_creation_input_tokens, cache_read_input_tokens,
                    cost_usd, turns, last_window_tokens, last_model,
                    started_at, last_turn_at
                ) VALUES (
                    ?1, ?2, ?3, ?4,
                    ?5, ?6, ?7, ?8,
                    ?9, 1, ?10, ?11,
                    ?12, ?12
                )
                ON CONFLICT(session_key, provider) DO UPDATE SET
                    input_tokens = input_tokens + ?5,
                    output_tokens = output_tokens + ?6,
                    cache_creation_input_tokens = cache_creation_input_tokens + ?7,
                    cache_read_input_tokens = cache_read_input_tokens + ?8,
                    cost_usd = cost_usd + ?9,
                    turns = turns + 1,
                    last_window_tokens = ?10,
                    last_model = COALESCE(?11, last_model),
                    last_turn_at = ?12,
                    agent_path = ?3,
                    workspace_id = ?4",
                libsql::params![
                    delta.session_key.to_string(),
                    delta.provider.to_string(),
                    delta.agent_path.to_string(),
                    delta.workspace_id.to_string(),
                    delta.input_tokens as i64,
                    delta.output_tokens as i64,
                    delta.cache_creation_input_tokens as i64,
                    delta.cache_read_input_tokens as i64,
                    delta.cost_usd,
                    last_window as i64,
                    delta.model.map(|m| m.to_string()),
                    now,
                ],
            )
            .await?;
        Ok(())
    }

    pub async fn get_session_usage(
        &self,
        session_key: &str,
        provider: &str,
    ) -> Result<Option<SessionUsageRow>> {
        let mut rows = self
            .conn()
            .query(
                "SELECT session_key, provider, agent_path, workspace_id,
                        input_tokens, output_tokens,
                        cache_creation_input_tokens, cache_read_input_tokens,
                        cost_usd, turns, last_window_tokens, last_model,
                        started_at, last_turn_at
                 FROM session_usage
                 WHERE session_key = ?1 AND provider = ?2",
                libsql::params![session_key.to_string(), provider.to_string()],
            )
            .await?;
        match rows.next().await? {
            Some(row) => Ok(Some(row_to_session_usage(&row)?)),
            None => Ok(None),
        }
    }

    /// Every session row for a workspace whose last turn is `>= since_iso`.
    /// Pass empty string for "all time".
    pub async fn list_workspace_usage(
        &self,
        workspace_id: &str,
        since_iso: &str,
    ) -> Result<Vec<SessionUsageRow>> {
        let mut rows = self
            .conn()
            .query(
                "SELECT session_key, provider, agent_path, workspace_id,
                        input_tokens, output_tokens,
                        cache_creation_input_tokens, cache_read_input_tokens,
                        cost_usd, turns, last_window_tokens, last_model,
                        started_at, last_turn_at
                 FROM session_usage
                 WHERE workspace_id = ?1 AND last_turn_at >= ?2
                 ORDER BY last_turn_at DESC",
                libsql::params![workspace_id.to_string(), since_iso.to_string()],
            )
            .await?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().await? {
            out.push(row_to_session_usage(&row)?);
        }
        Ok(out)
    }

    /// Every session row for an agent whose last turn is `>= since_iso`.
    pub async fn list_agent_usage(
        &self,
        agent_path: &str,
        since_iso: &str,
    ) -> Result<Vec<SessionUsageRow>> {
        let mut rows = self
            .conn()
            .query(
                "SELECT session_key, provider, agent_path, workspace_id,
                        input_tokens, output_tokens,
                        cache_creation_input_tokens, cache_read_input_tokens,
                        cost_usd, turns, last_window_tokens, last_model,
                        started_at, last_turn_at
                 FROM session_usage
                 WHERE agent_path = ?1 AND last_turn_at >= ?2
                 ORDER BY last_turn_at DESC",
                libsql::params![agent_path.to_string(), since_iso.to_string()],
            )
            .await?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().await? {
            out.push(row_to_session_usage(&row)?);
        }
        Ok(out)
    }
}

fn row_to_session_usage(row: &libsql::Row) -> Result<SessionUsageRow> {
    let input_tokens: i64 = row.get(4)?;
    let output_tokens: i64 = row.get(5)?;
    let cache_create: i64 = row.get(6)?;
    let cache_read: i64 = row.get(7)?;
    let turns: i64 = row.get(9)?;
    let last_window: i64 = row.get(10)?;
    Ok(SessionUsageRow {
        session_key: row.get(0)?,
        provider: row.get(1)?,
        agent_path: row.get(2)?,
        workspace_id: row.get(3)?,
        input_tokens: input_tokens.max(0) as u64,
        output_tokens: output_tokens.max(0) as u64,
        cache_creation_input_tokens: cache_create.max(0) as u64,
        cache_read_input_tokens: cache_read.max(0) as u64,
        cost_usd: row.get(8)?,
        turns: turns.max(0) as u64,
        last_window_tokens: last_window.max(0) as u64,
        last_model: row.get(11).ok(),
        started_at: row.get(12)?,
        last_turn_at: row.get(13)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn delta<'a>(
        session: &'a str,
        provider: &'a str,
        agent: &'a str,
        ws: &'a str,
        input: u64,
        output: u64,
    ) -> SessionUsageDelta<'a> {
        SessionUsageDelta {
            session_key: session,
            provider,
            agent_path: agent,
            workspace_id: ws,
            input_tokens: input,
            output_tokens: output,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            cost_usd: 0.001,
            model: Some("claude-opus-4-7"),
        }
    }

    #[tokio::test]
    async fn upsert_accumulates_across_turns() {
        let db = Database::connect_in_memory().await.unwrap();
        db.upsert_session_usage(delta("s1", "anthropic", "ws/a", "ws", 100, 50))
            .await
            .unwrap();
        db.upsert_session_usage(delta("s1", "anthropic", "ws/a", "ws", 200, 80))
            .await
            .unwrap();

        let row = db.get_session_usage("s1", "anthropic").await.unwrap().unwrap();
        assert_eq!(row.input_tokens, 300);
        assert_eq!(row.output_tokens, 130);
        assert_eq!(row.turns, 2);
    }

    #[tokio::test]
    async fn last_window_tracks_most_recent_turn() {
        // The dashboard shows "context window used" — it must reflect the
        // LAST turn's combined input, not the running sum.
        let db = Database::connect_in_memory().await.unwrap();
        let mut d1 = delta("s1", "anthropic", "ws/a", "ws", 100, 50);
        d1.cache_read_input_tokens = 50_000;
        db.upsert_session_usage(d1).await.unwrap();

        let mut d2 = delta("s1", "anthropic", "ws/a", "ws", 200, 80);
        d2.cache_read_input_tokens = 150_000;
        db.upsert_session_usage(d2).await.unwrap();

        let row = db.get_session_usage("s1", "anthropic").await.unwrap().unwrap();
        assert_eq!(row.last_window_tokens, 200 + 150_000);
        // Cumulative still grows.
        assert_eq!(row.cache_read_input_tokens, 200_000);
    }

    #[tokio::test]
    async fn workspace_and_agent_lists_filter_by_recency() {
        let db = Database::connect_in_memory().await.unwrap();
        db.upsert_session_usage(delta("s1", "anthropic", "ws/maya", "ws", 100, 50))
            .await
            .unwrap();
        db.upsert_session_usage(delta("s2", "anthropic", "ws/diego", "ws", 80, 40))
            .await
            .unwrap();
        db.upsert_session_usage(delta("s3", "openai", "other/agent", "other", 10, 5))
            .await
            .unwrap();

        let ws_rows = db.list_workspace_usage("ws", "").await.unwrap();
        assert_eq!(ws_rows.len(), 2);
        let agent_rows = db.list_agent_usage("ws/maya", "").await.unwrap();
        assert_eq!(agent_rows.len(), 1);
        assert_eq!(agent_rows[0].session_key, "s1");

        // since filter — a far-future timestamp returns nothing.
        let none = db
            .list_workspace_usage("ws", "9999-01-01T00:00:00Z")
            .await
            .unwrap();
        assert!(none.is_empty());
    }

    #[tokio::test]
    async fn providers_are_independent_keys() {
        let db = Database::connect_in_memory().await.unwrap();
        db.upsert_session_usage(delta("s1", "anthropic", "ws/a", "ws", 100, 50))
            .await
            .unwrap();
        db.upsert_session_usage(delta("s1", "openai", "ws/a", "ws", 200, 80))
            .await
            .unwrap();

        let claude = db.get_session_usage("s1", "anthropic").await.unwrap().unwrap();
        let codex = db.get_session_usage("s1", "openai").await.unwrap().unwrap();
        assert_eq!(claude.input_tokens, 100);
        assert_eq!(codex.input_tokens, 200);
    }
}
