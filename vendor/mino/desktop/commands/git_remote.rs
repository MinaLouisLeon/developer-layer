//! The remote and conflict commands. Dispatch only, like every command here.
//!
//! **No credential passes through this file, and there is none to pass.**
//! `plan/decisions.md` D3 settled that git authenticates with its own
//! credential helper, the SSH agent or the OS keychain; nothing in this
//! process reads, holds, forwards or logs a secret. What crosses this boundary
//! is a remote name and a branch name, and a result whose every string has
//! already been through `mino_core::git::redact`.

use mino_core::types::{
    ConflictResolution, GitConflict, GitFetchResult, GitPullResult, GitPushResult, GitRemote,
    PullRequest, PushRequest,
};
use mino_core::TransportError;
use tauri::State;

use crate::mino::state::AppState;

use super::git::git;

#[tauri::command]
pub async fn git_remotes(state: State<'_, AppState>) -> Result<Vec<GitRemote>, TransportError> {
    let transport = state.current()?;
    git(&transport)?.remotes().await
}

/// The safe one: it changes nothing in the working tree.
#[tauri::command]
pub async fn git_fetch(
    state: State<'_, AppState>,
    remote: Option<String>,
) -> Result<GitFetchResult, TransportError> {
    let transport = state.current()?;
    git(&transport)?.fetch(remote).await
}

/// Refuses on a dirty working tree rather than merging over it. That check is
/// in the core, where both transports get it.
#[tauri::command]
pub async fn git_pull(
    state: State<'_, AppState>,
    request: PullRequest,
) -> Result<GitPullResult, TransportError> {
    let transport = state.current()?;
    git(&transport)?.pull(request).await
}

/// The one that can destroy work belonging to somebody else, and only with
/// `force`. The confirmation has already happened in the UI - by the time a
/// call reaches here the reader has been shown the remote and the branch - and
/// the core sends `--force-with-lease` rather than `--force`.
#[tauri::command]
pub async fn git_push(
    state: State<'_, AppState>,
    request: PushRequest,
) -> Result<GitPushResult, TransportError> {
    let transport = state.current()?;
    git(&transport)?.push(request).await
}

#[tauri::command]
pub async fn git_conflicts(state: State<'_, AppState>) -> Result<Vec<GitConflict>, TransportError> {
    let transport = state.current()?;
    git(&transport)?.conflicts().await
}

/// Two of the three resolutions discard one side. The confirmation, and the
/// wording that says which side is kept, are the panel's job.
#[tauri::command]
pub async fn git_resolve(
    state: State<'_, AppState>,
    path: String,
    resolution: ConflictResolution,
) -> Result<(), TransportError> {
    let transport = state.current()?;
    git(&transport)?.resolve(&path, resolution).await
}
