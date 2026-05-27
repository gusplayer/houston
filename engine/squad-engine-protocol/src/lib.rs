//! Houston Engine wire protocol.
//!
//! Single source of truth for REST DTOs, the WebSocket envelope, error
//! codes, and the protocol version. Every client (desktop, mobile, CLI,
//! third-party) speaks this protocol to talk to `squad-engine`.

use serde::{Deserialize, Serialize};
use squad_ui_events::SquadEvent;

/// Protocol major version. Incremented on breaking changes.
pub const PROTOCOL_VERSION: u8 = 1;

/// Engine version string (matches the server crate's package version).
pub const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Header name for engine version on every response.
pub const HEADER_ENGINE_VERSION: &str = "X-Squad-Engine-Version";

/// Envelope for every WebSocket frame.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineEnvelope {
    /// Protocol version (currently 1).
    pub v: u8,
    /// Correlation id (client-chosen or server-chosen). UUID.
    pub id: String,
    /// Kind of frame.
    pub kind: EnvelopeKind,
    /// Unix epoch milliseconds when the frame was produced.
    pub ts: i64,
    /// Inner payload. Shape depends on `kind`.
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EnvelopeKind {
    /// Server-push event (payload = `SquadEvent` or `LagMarker`).
    Event,
    /// Client → server request (payload = `ClientRequest`).
    Req,
    /// Server → client response (payload = operation-specific).
    Res,
    /// Keep-alive. Payload empty object.
    Ping,
    /// Keep-alive reply. Payload empty object.
    Pong,
}

/// Client → server WebSocket request operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum ClientRequest {
    /// Subscribe to a list of topics.
    Sub { topics: Vec<String> },
    /// Unsubscribe from a list of topics.
    Unsub { topics: Vec<String> },
}

/// Emitted on the WS when the server drops events due to backpressure.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LagMarker {
    pub dropped: u64,
}

/// REST error body.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorBody {
    pub error: ErrorDetail,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorDetail {
    pub code: ErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    Unauthorized,
    Forbidden,
    NotFound,
    BadRequest,
    Conflict,
    Internal,
    Unavailable,
    VersionMismatch,
}

/// Response for `GET /v1/health`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub version: &'static str,
    pub protocol: u8,
}

/// Response for `GET /v1/version`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionResponse {
    pub engine: &'static str,
    pub protocol: u8,
    pub build: Option<String>,
}

/// Helper: build an event envelope from a SquadEvent.
pub fn event_envelope(event: &SquadEvent) -> EngineEnvelope {
    EngineEnvelope {
        v: PROTOCOL_VERSION,
        id: uuid::Uuid::new_v4().to_string(),
        kind: EnvelopeKind::Event,
        ts: chrono::Utc::now().timestamp_millis(),
        payload: serde_json::to_value(event).unwrap_or(serde_json::Value::Null),
    }
}

/// Map a `SquadEvent` to its WS topic.
///
/// Topics are the routing key clients subscribe to via `ClientRequest::Sub`.
/// Naming convention: `{category}:{id}` for scoped events, bare `{category}`
/// for singleton categories.
///
/// Session events (`FeedItem`, `SessionStatus`) route to `session:{session_key}`.
/// All other categories get a fixed topic so clients can choose what to hear.
pub fn event_topic(event: &SquadEvent) -> String {
    match event {
        SquadEvent::FeedItem { session_key, .. }
        | SquadEvent::SessionStatus { session_key, .. } => format!("session:{session_key}"),
        SquadEvent::AuthRequired { .. } => "auth".into(),
        SquadEvent::Toast { .. } | SquadEvent::CompletionToast { .. } => "toast".into(),
        SquadEvent::EventReceived { .. } | SquadEvent::EventProcessed { .. } => "events".into(),
        SquadEvent::HeartbeatFired { .. } | SquadEvent::CronFired { .. } => "scheduler".into(),
        SquadEvent::RoutinesChanged { agent_path }
        | SquadEvent::RoutineRunsChanged { agent_path } => format!("routines:{agent_path}"),
        SquadEvent::ActivityChanged { agent_path }
        | SquadEvent::SkillsChanged { agent_path }
        | SquadEvent::FilesChanged { agent_path }
        | SquadEvent::ConfigChanged { agent_path }
        | SquadEvent::ContextChanged { agent_path }
        | SquadEvent::LearningsChanged { agent_path }
        | SquadEvent::SprintsChanged { agent_path }
        | SquadEvent::StoriesChanged { agent_path } => format!("agent:{agent_path}"),
        SquadEvent::ConversationsChanged { agent_path, .. } => format!("agent:{agent_path}"),
        SquadEvent::SessionUsageChanged { agent_path, .. } => format!("agent:{agent_path}"),
        SquadEvent::ComposioCliReady
        | SquadEvent::ComposioCliFailed { .. }
        | SquadEvent::ComposioConnectionAdded { .. } => "composio".into(),
        SquadEvent::ClaudeCliInstalling { .. }
        | SquadEvent::ClaudeCliReady
        | SquadEvent::ClaudeCliFailed { .. } => "claude".into(),
        SquadEvent::MethodologyConfigChanged { workspace_id }
        | SquadEvent::MethodologySeeded { workspace_id, .. }
        | SquadEvent::ProjectDocChanged { workspace_id, .. } => {
            format!("workspace:{workspace_id}")
        }
    }
}

/// Whether a feed item is "low severity" — i.e. streaming deltas that can be
/// dropped under backpressure without breaking the conversation (because the
/// final non-streaming variant will follow).
pub fn is_low_severity_feed(item: &squad_terminal_manager::FeedItem) -> bool {
    matches!(
        item,
        squad_terminal_manager::FeedItem::AssistantTextStreaming(_)
            | squad_terminal_manager::FeedItem::ThinkingStreaming(_)
    )
}

/// Per-session usage record returned by the engine. Mirrors
/// `squad_db::SessionUsageRow` minus storage-only fields. All counts are
/// cumulative across every turn in the session. `last_window_tokens` is the
/// most recent turn's combined input — the figure the frontend renders as
/// "context window full".
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUsageDto {
    pub session_key: String,
    pub provider: String,
    pub agent_path: String,
    pub workspace_id: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_input_tokens: u64,
    pub cache_read_input_tokens: u64,
    /// CLI's API-rate equivalent cost. Subscription users do not pay this.
    pub cost_usd: f64,
    pub turns: u64,
    pub last_window_tokens: u64,
    pub last_model: Option<String>,
    /// Context-window size for `last_model`, if known. Pairs with
    /// `last_window_tokens` for the percentage bar.
    pub context_window: Option<u64>,
    pub started_at: String,
    pub last_turn_at: String,
}

/// Aggregated usage for one agent across all sessions in a given range.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentUsageDto {
    pub agent_path: String,
    pub sessions: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_input_tokens: u64,
    pub cache_read_input_tokens: u64,
    pub cost_usd: f64,
    pub turns: u64,
}

/// Workspace dashboard payload. Top-level totals + per-agent rollups + the
/// raw session rows for the recent-sessions list.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceUsageDto {
    pub workspace_id: String,
    /// Inclusive lower bound used for the range query, RFC3339. Empty = all-time.
    pub since: String,
    pub totals: AgentUsageDto,
    pub agents: Vec<AgentUsageDto>,
    pub sessions: Vec<SessionUsageDto>,
}

/// One block injected into the assembled system prompt for a session.
/// `est_tokens` is `char_count / 4` — close enough for a UI bar, not a
/// substitute for the API's tokenizer.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextBlockDto {
    /// Stable id (e.g. `claude_md`, `learnings`, `skills_index`,
    /// `integrations`, `projects`, `workspace_doc:<slug>`, `agent_doc:<slug>`).
    pub source: String,
    /// Human-friendly title shown in the inspector.
    pub title: String,
    pub char_count: u64,
    pub est_tokens: u64,
}

/// Composition of the initial prompt the engine assembles for a session,
/// plus the live "window used" figure from the most recent turn.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextBreakdownDto {
    pub blocks: Vec<ContextBlockDto>,
    pub total_chars: u64,
    pub total_est_tokens: u64,
    /// Most recent turn's combined input. `None` before the first turn lands.
    pub last_window_tokens: Option<u64>,
    pub last_model: Option<String>,
    /// Capacity of `last_model`. Pair with `last_window_tokens` for `%`.
    pub context_window: Option<u64>,
}

/// Context-window size in tokens for a given provider model id, or `None`
/// when the model id is unrecognised. Hardcoded — there's no machine-readable
/// catalog for these limits so we map known ids best-effort and bump this
/// table as new models ship. The frontend uses this for "context window
/// used" bars in the usage dashboard; an unknown model degrades gracefully
/// to "raw tokens" with no percentage.
pub fn model_context_window(model: &str) -> Option<u64> {
    let m = model.to_lowercase();
    if m.contains("opus-4-7") && m.contains("[1m]") {
        return Some(1_000_000);
    }
    if m.contains("opus-4-7") || m.contains("opus-4-6") {
        return Some(200_000);
    }
    if m.contains("sonnet-4-6") || m.contains("sonnet-4-5") {
        return Some(1_000_000);
    }
    if m.contains("haiku-4-5") {
        return Some(200_000);
    }
    if m.contains("gpt-5") || m.contains("gpt-4.1") {
        return Some(1_000_000);
    }
    if m.starts_with("o4") || m.starts_with("o3") {
        return Some(200_000);
    }
    None
}

/// Build a `LagMarker` event envelope suitable for sending on the WS.
pub fn lag_marker_envelope(dropped: u64) -> EngineEnvelope {
    EngineEnvelope {
        v: PROTOCOL_VERSION,
        id: uuid::Uuid::new_v4().to_string(),
        kind: EnvelopeKind::Event,
        ts: chrono::Utc::now().timestamp_millis(),
        payload: serde_json::json!({ "type": "Lag", "dropped": dropped }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn envelope_round_trip() {
        let e = EngineEnvelope {
            v: 1,
            id: "abc".into(),
            kind: EnvelopeKind::Ping,
            ts: 123,
            payload: serde_json::json!({}),
        };
        let s = serde_json::to_string(&e).unwrap();
        let d: EngineEnvelope = serde_json::from_str(&s).unwrap();
        assert_eq!(d.kind, EnvelopeKind::Ping);
    }

    #[test]
    fn error_code_serializes_screaming_snake() {
        let s = serde_json::to_string(&ErrorCode::NotFound).unwrap();
        assert_eq!(s, "\"NOT_FOUND\"");
    }

    #[test]
    fn client_request_sub() {
        let r: ClientRequest = serde_json::from_str(r#"{"op":"sub","topics":["a","b"]}"#).unwrap();
        matches!(r, ClientRequest::Sub { .. });
    }

    #[test]
    fn event_topic_session_scoped() {
        let ev = SquadEvent::FeedItem {
            agent_path: "/a".into(),
            session_key: "k1".into(),
            item: squad_terminal_manager::FeedItem::AssistantText("hi".into()),
        };
        assert_eq!(event_topic(&ev), "session:k1");

        let ev = SquadEvent::SessionStatus {
            agent_path: "/a".into(),
            session_key: "k1".into(),
            status: "running".into(),
            error: None,
        };
        assert_eq!(event_topic(&ev), "session:k1");
    }

    #[test]
    fn event_topic_singletons() {
        let ev = SquadEvent::Toast {
            message: "x".into(),
            variant: "info".into(),
        };
        assert_eq!(event_topic(&ev), "toast");
        assert_eq!(event_topic(&SquadEvent::ComposioCliReady), "composio");
    }

    #[test]
    fn low_severity_feed_detection() {
        use squad_terminal_manager::FeedItem;
        assert!(is_low_severity_feed(&FeedItem::AssistantTextStreaming(
            "x".into()
        )));
        assert!(is_low_severity_feed(&FeedItem::ThinkingStreaming(
            "x".into()
        )));
        assert!(!is_low_severity_feed(&FeedItem::AssistantText("x".into())));
    }
}
