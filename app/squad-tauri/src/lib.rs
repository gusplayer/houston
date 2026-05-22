//! squad-tauri — Tauri adapter for the Houston desktop app.
//!
//! Post-Phase-4 this crate is intentionally thin: domain logic lives in
//! `squad-engine-core` and is exposed over HTTP+WS by
//! `squad-engine-server`. The adapter only keeps what the desktop
//! specifically needs: OS-native glue (tray, event sink, path helpers,
//! shared state).

pub mod event_sink;
pub mod paths;
pub mod state;
pub mod tray;

pub use event_sink::{tauri_sink, TauriEventSink};

// Re-export sub-crates for convenience.
pub use squad_agent_files;
pub use squad_agents_conversations;
pub use squad_db;
pub use squad_events;
pub use squad_scheduler;
pub use squad_terminal_manager;
pub use squad_ui_events;
