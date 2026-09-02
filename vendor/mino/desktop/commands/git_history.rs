//! The read-only git commands: diff, log, show and blame.
//!
//! Split from `git.rs` for the same reason the core is: reading history and
//! changing the repository are two different jobs, and only one of them can
//! lose anything. Dispatch only, like every command in this module.

use mino_core::types::{DiffRequest, GitBlame, GitCommitDetail, GitDiff, GitLog, LogRequest};
use mino_core::TransportError;
use tauri::State;

use crate::mino::state::AppState;

use super::git::git;

#[tauri::command]
pub async fn git_diff(
    state: State<'_, AppState>,
    request: DiffRequest,
) -> Result<GitDiff, TransportError> {
    let transport = state.current()?;
    git(&transport)?.diff(request).await
}

#[tauri::command]
pub async fn git_log(
    state: State<'_, AppState>,
    request: LogRequest,
) -> Result<GitLog, TransportError> {
    let transport = state.current()?;
    git(&transport)?.log(request).await
}

#[tauri::command]
pub async fn git_show(
    state: State<'_, AppState>,
    revision: String,
) -> Result<GitCommitDetail, TransportError> {
    let transport = state.current()?;
    git(&transport)?.show(&revision).await
}

#[tauri::command]
pub async fn git_commit_diff(
    state: State<'_, AppState>,
    revision: String,
    path: Option<String>,
) -> Result<GitDiff, TransportError> {
    let transport = state.current()?;
    git(&transport)?
        .commit_diff(&revision, path.as_deref())
        .await
}

#[tauri::command]
pub async fn git_blame(
    state: State<'_, AppState>,
    path: String,
) -> Result<GitBlame, TransportError> {
    let transport = state.current()?;
    git(&transport)?.blame(&path).await
}
