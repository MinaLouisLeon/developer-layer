use mino_core::types::{PtySession, PtySessionId, PtySize, PtySpawnSpec};
use mino_core::TransportError;
use tauri::{AppHandle, Emitter, State};

use crate::mino::state::AppState;

/// Tauri event channel a session's output is pushed on. The UI subscribes to
/// exactly this name; it is the only place the format is written down.
pub fn event_name(id: &PtySessionId) -> String {
    format!("pty://{id}")
}

#[tauri::command]
pub async fn open_pty(
    app: AppHandle,
    state: State<'_, AppState>,
    spec: PtySpawnSpec,
) -> Result<PtySession, TransportError> {
    let stream = state.current()?.open_pty(spec).await?;
    let session = stream.session.clone();
    let channel = event_name(&session.id);
    let mut events = stream.events;

    // The core hands back a channel because a channel cannot cross IPC. This
    // task is the bridge, and it ends when the session's sender is dropped.
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            if let Err(err) = app.emit(&channel, &event) {
                tracing::warn!(%err, "dropping pty output: the window is gone");
                break;
            }
        }
    });

    Ok(session)
}

#[tauri::command]
pub async fn write_pty(
    state: State<'_, AppState>,
    id: PtySessionId,
    data: String,
) -> Result<(), TransportError> {
    state.current()?.write_pty(&id, &data).await
}

#[tauri::command]
pub async fn resize_pty(
    state: State<'_, AppState>,
    id: PtySessionId,
    size: PtySize,
) -> Result<(), TransportError> {
    state.current()?.resize_pty(&id, size).await
}

#[tauri::command]
pub async fn close_pty(state: State<'_, AppState>, id: PtySessionId) -> Result<(), TransportError> {
    state.current()?.close_pty(&id).await
}
