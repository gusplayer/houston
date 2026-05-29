//! Translates Claude Code JSONL transcript lines into `chat_feed` rows and
//! `FeedItem` events for WS live streaming.
//!
//! Pure-translation helpers return `Vec<FeedRow>` (no I/O). The caller in
//! `mod.rs` does the actual DB writes and event emissions.

use squad_terminal_manager::FeedItem;

/// One item destined for `chat_feed` + an optional WS event.
pub struct FeedRow {
    pub feed_type: String,
    pub data_json: String,
    pub item: Option<FeedItem>,
}

/// Translate a transcript `user` line's message into feed rows.
///
/// `message.content` may be a bare string, or an array of blocks
/// (`text`, `tool_result`).
pub fn translate_user_line(obj: &serde_json::Value) -> Vec<FeedRow> {
    let msg = &obj["message"];
    let content = &msg["content"];
    let mut rows = Vec::new();

    if let Some(text) = content.as_str() {
        if !text.is_empty() {
            rows.push(FeedRow {
                feed_type: "user_message".into(),
                data_json: json_str(text),
                item: Some(FeedItem::UserMessage(text.to_string())),
            });
        }
        return rows;
    }
    if let Some(blocks) = content.as_array() {
        for block in blocks {
            match block["type"].as_str() {
                Some("text") => {
                    if let Some(text) = block["text"].as_str() {
                        if !text.is_empty() {
                            rows.push(FeedRow {
                                feed_type: "user_message".into(),
                                data_json: json_str(text),
                                item: Some(FeedItem::UserMessage(text.to_string())),
                            });
                        }
                    }
                }
                Some("tool_result") => {
                    let content_val = &block["content"];
                    let content_str = if let Some(s) = content_val.as_str() {
                        s.to_string()
                    } else {
                        content_val.to_string()
                    };
                    let is_error = block["is_error"].as_bool().unwrap_or(false);
                    let data = serde_json::json!({
                        "content": content_str,
                        "is_error": is_error,
                    });
                    rows.push(FeedRow {
                        feed_type: "tool_result".into(),
                        data_json: data.to_string(),
                        item: Some(FeedItem::ToolResult { content: content_str, is_error }),
                    });
                }
                _ => {}
            }
        }
    }
    rows
}

/// Translate an `assistant` line's message content blocks into feed rows.
pub fn translate_assistant_content(msg: &serde_json::Value) -> Vec<FeedRow> {
    let mut rows = Vec::new();
    let Some(blocks) = msg["content"].as_array() else {
        return rows;
    };
    for block in blocks {
        match block["type"].as_str() {
            Some("text") => {
                if let Some(text) = block["text"].as_str() {
                    if !text.is_empty() {
                        rows.push(FeedRow {
                            feed_type: "assistant_text".into(),
                            data_json: json_str(text),
                            item: Some(FeedItem::AssistantText(text.to_string())),
                        });
                    }
                }
            }
            Some("tool_use") => {
                let name = block["name"].as_str().unwrap_or("unknown").to_string();
                let input = block["input"].clone();
                let data =
                    serde_json::json!({ "name": name, "input": input });
                rows.push(FeedRow {
                    feed_type: "tool_call".into(),
                    data_json: data.to_string(),
                    item: Some(FeedItem::ToolCall { name, input }),
                });
            }
            _ => {}
        }
    }
    rows
}

/// Absolute path to the `.sid` file for a Squad session key.
pub fn sid_path(working_dir: &std::path::Path, session_key: &str) -> std::path::PathBuf {
    working_dir
        .join(".squad")
        .join("sessions")
        .join("anthropic")
        .join(format!("{session_key}.sid"))
}

/// Atomically write `session_id` to the Squad `.sid` file so
/// `history::load` can discover xterm sessions via their session_key.
pub fn write_sid(working_dir: &std::path::Path, session_key: &str, session_id: &str) {
    let path = sid_path(working_dir, session_key);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&path, session_id);
}

fn json_str(s: &str) -> String {
    serde_json::Value::String(s.to_string()).to_string()
}
