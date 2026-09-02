//! The stash commands. Dispatch only, like every command in this module.
//!
//! An index is a `u32` all the way through - the UI reads it from
//! `GitStash.index` and hands it straight back - so there is no caller string
//! naming a stash entry anywhere in this path.

use mino_core::types::{GitStash, StashRequest};
use mino_core::TransportError;
use tauri::State;

use crate::mino::state::AppState;

use super::git::git;

#[tauri::command]
pub async fn git_stash_list(state: State<'_, AppState>) -> Result<Vec<GitStash>, TransportError> {
    let transport = state.current()?;
    git(&transport)?.stash_list().await
}

#[tauri::command]
pub async fn git_stash_push(
    state: State<'_, AppState>,
    request: StashRequest,
) -> Result<(), TransportError> {
    let transport = state.current()?;
    git(&transport)?.stash_push(request).await
}

#[tauri::command]
pub async fn git_stash_apply(
    state: State<'_, AppState>,
    index: u32,
    pop: bool,
) -> Result<(), TransportError> {
    let transport = state.current()?;
    git(&transport)?.stash_apply(index, pop).await
}

/// The destructive one: what it removes is reachable only through the reflog
/// afterwards. The confirmation has already happened in the UI.
#[tauri::command]
pub async fn git_stash_drop(state: State<'_, AppState>, index: u32) -> Result<(), TransportError> {
    let transport = state.current()?;
    git(&transport)?.stash_drop(index).await
}
