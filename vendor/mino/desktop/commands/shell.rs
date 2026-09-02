use mino_core::types::{ShellProbe, StructuredOutput, StructuredRequest};
use mino_core::TransportError;
use tauri::State;

use crate::mino::state::AppState;

#[tauri::command]
pub async fn run_structured(
    state: State<'_, AppState>,
    request: StructuredRequest,
) -> Result<StructuredOutput, TransportError> {
    state.current()?.run_structured(request).await
}

#[tauri::command]
pub async fn probe_shell(state: State<'_, AppState>) -> Result<ShellProbe, TransportError> {
    state.current()?.probe_shell().await
}
