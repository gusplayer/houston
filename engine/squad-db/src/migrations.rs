use crate::db::Database;
use anyhow::Result;

impl Database {
    /// Run base migrations for the generic Houston tables.
    /// Application-specific migrations should be run separately by the consuming app.
    pub(crate) async fn run_migrations(&self) -> Result<()> {
        // chat_feed table — session-keyed by claude_session_id. No project_id/feed_key
        // legacy columns: every conversation is scoped by its Claude session.
        self.conn()
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS chat_feed (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    claude_session_id TEXT NOT NULL,
                    feed_type TEXT NOT NULL,
                    data_json TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT 'desktop',
                    timestamp TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_chat_feed_session
                    ON chat_feed(claude_session_id);",
            )
            .await
            .ok();

        // FTS5 full-text search index over chat messages.
        // Standalone table (no content=) so snippet() works and we control sync via triggers.
        self.conn()
            .execute_batch(
                "CREATE VIRTUAL TABLE IF NOT EXISTS chat_feed_fts USING fts5(
                    content,
                    tokenize='unicode61 remove_diacritics 2'
                );

                CREATE TRIGGER IF NOT EXISTS chat_feed_fts_insert
                AFTER INSERT ON chat_feed BEGIN
                    INSERT INTO chat_feed_fts(rowid, content)
                    VALUES (new.id, new.data_json);
                END;

                CREATE TRIGGER IF NOT EXISTS chat_feed_fts_delete
                AFTER DELETE ON chat_feed BEGIN
                    INSERT INTO chat_feed_fts(chat_feed_fts, rowid, content)
                    VALUES('delete', old.id, old.data_json);
                END;",
            )
            .await
            .ok();

        // engine_tokens — device-scoped bearer tokens minted during pairing.
        // Stored as SHA-256 hash (never the plaintext). `revoked_at` null
        // means live. The bootstrap token (from SQUAD_ENGINE_TOKEN or the
        // auto-gen in config) is NOT in this table — it's checked separately.
        self.conn()
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS engine_tokens (
                    token_hash TEXT PRIMARY KEY,
                    device_label TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    revoked_at TEXT,
                    last_seen_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_engine_tokens_active
                    ON engine_tokens(revoked_at);",
            )
            .await
            .ok();

        // session_usage — per-(session, provider) token + cost accumulation.
        // One row per chat conversation per provider; upserted on every turn
        // that the CLI reports usage for. `agent_path` and `workspace_id`
        // are stored denormalised so the dashboard can group without an
        // extra lookup table. Costs are the CLI's own per-token estimate —
        // for subscription users it is API-rate equivalent, not real spend;
        // the UI labels it as such.
        self.conn()
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS session_usage (
                    session_key TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    agent_path TEXT NOT NULL,
                    workspace_id TEXT NOT NULL,
                    input_tokens INTEGER NOT NULL DEFAULT 0,
                    output_tokens INTEGER NOT NULL DEFAULT 0,
                    cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
                    cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
                    cost_usd REAL NOT NULL DEFAULT 0,
                    turns INTEGER NOT NULL DEFAULT 0,
                    last_window_tokens INTEGER NOT NULL DEFAULT 0,
                    last_model TEXT,
                    started_at TEXT NOT NULL,
                    last_turn_at TEXT NOT NULL,
                    PRIMARY KEY (session_key, provider)
                );
                CREATE INDEX IF NOT EXISTS idx_session_usage_workspace
                    ON session_usage(workspace_id, last_turn_at);
                CREATE INDEX IF NOT EXISTS idx_session_usage_agent
                    ON session_usage(agent_path, last_turn_at);",
            )
            .await
            .ok();

        // phone_access — stable high-entropy secret encoded into the QR
        // shown by the desktop app. Rotating it revokes every existing
        // device token and makes old QR codes unusable.
        self.conn()
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS phone_access (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    access_secret TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    rotated_at TEXT NOT NULL
                );",
            )
            .await
            .ok();

        Ok(())
    }
}
