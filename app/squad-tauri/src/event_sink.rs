//! Tauri implementation of the transport-neutral `EventSink` contract.
//!
//! Bridges `squad-ui-events::EventSink` (used by every engine crate) to
//! Tauri's `app_handle.emit(...)`. Lives in `squad-tauri` (the adapter)
//! so the engine crates remain free of `tauri` dependencies.

use squad_ui_events::{DynEventSink, EventSink, SquadEvent};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

/// `EventSink` impl backed by Tauri's event bus. Emits every event under
/// the `"squad-event"` channel for the webview to listen on.
#[derive(Clone)]
pub struct TauriEventSink {
    handle: AppHandle,
}

impl TauriEventSink {
    pub fn new(handle: AppHandle) -> Self {
        Self { handle }
    }
}

impl EventSink for TauriEventSink {
    fn emit(&self, event: SquadEvent) {
        if let Err(err) = self.handle.emit("squad-event", event) {
            tracing::warn!("[tauri-event-sink] emit failed: {err}");
        }
    }
}

/// Convenience constructor — returns an `Arc<dyn EventSink>` ready to pass
/// into engine crates.
pub fn tauri_sink(handle: &AppHandle) -> DynEventSink {
    Arc::new(TauriEventSink::new(handle.clone()))
}
