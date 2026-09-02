use mino_core::types::{ConnectionInfo, ConnectionTarget};
use mino_core::TransportError;
use tauri::State;

use crate::mino::state::AppState;

#[tauri::command]
pub async fn connect(
    state: State<'_, AppState>,
    target: ConnectionTarget,
) -> Result<ConnectionInfo, TransportError> {
    // Tear the previous session down first so its pty sessions cannot outlive
    // it. Failures are ignored: the old transport may already be gone.
    if let Some(previous) = state.take() {
        let _ = previous.disconnect().await;
    }
    let transport = state.select(&target)?;
    transport.connect(&target).await
}

#[tauri::command]
pub async fn disconnect(state: State<'_, AppState>) -> Result<(), TransportError> {
    match state.take() {
        Some(transport) => transport.disconnect().await,
        None => Ok(()),
    }
}
