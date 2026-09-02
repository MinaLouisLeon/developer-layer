//! Git commands. Dispatch only, like every other module here.
//!
//! One extra step compared with `fs.rs`: git lives on a second trait reached
//! through `Transport::git`, so each command takes the surface before calling
//! it. A transport with no git surface at all answers `Unimplemented` naming
//! itself, which is a different sentence from "this folder is not a
//! repository" - and the two must not be collapsed, because only one of them
//! is a normal thing for a folder to be.

use mino_core::types::{CommitRequest, GitCommit, GitRepository, GitStatus};
use mino_core::{Transport, TransportError};
use std::sync::Arc;
use tauri::State;

use crate::mino::state::AppState;

#[tauri::command]
pub async fn git_repository(
    state: State<'_, AppState>,
) -> Result<Option<GitRepository>, TransportError> {
    let transport = state.current()?;
    git(&transport)?.repository().await
}

#[tauri::command]
pub async fn git_status(state: State<'_, AppState>) -> Result<GitStatus, TransportError> {
    let transport = state.current()?;
    git(&transport)?.status().await
}

#[tauri::command]
pub async fn git_stage(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<(), TransportError> {
    let transport = state.current()?;
    git(&transport)?.stage(&paths).await
}

#[tauri::command]
pub async fn git_unstage(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<(), TransportError> {
    let transport = state.current()?;
    git(&transport)?.unstage(&paths).await
}

/// The destructive one. The confirmation is the UI's job - by the time a call
/// reaches here the user has already been asked - and the path guard in
/// `mino_core::git::guard` is what makes sure it can only reach files the
/// session owns.
#[tauri::command]
pub async fn git_discard(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<(), TransportError> {
    let transport = state.current()?;
    git(&transport)?.discard(&paths).await
}

#[tauri::command]
pub async fn git_commit(
    state: State<'_, AppState>,
    request: CommitRequest,
) -> Result<GitCommit, TransportError> {
    let transport = state.current()?;
    git(&transport)?.commit(request).await
}

/// The git surface of the current transport, or the typed error saying this
/// target has none. Shared with `git_history.rs`, so both halves reach it the
/// same way.
pub(super) fn git(
    transport: &Arc<dyn Transport>,
) -> Result<&dyn mino_core::GitTransport, TransportError> {
    transport
        .git()
        .ok_or_else(|| TransportError::unimplemented(transport.kind(), "git"))
}
