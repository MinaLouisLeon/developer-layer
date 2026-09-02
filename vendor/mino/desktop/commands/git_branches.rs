//! The branch commands. Dispatch only, like every command in this module.
//!
//! Split from `git.rs` the way the core trait is split: branches are the first
//! thing on this interface that changes files under the *other* panes, and
//! keeping them in their own file is what makes that visible rather than
//! buried in a list.
//!
//! Nothing here decides when the panes refresh. That is one event in the UI,
//! fired after the call returns, so every pane learns at the same moment
//! instead of each guessing - see `docs/mino-workbench/git-module.md`.

use mino_core::types::{CreateBranchRequest, GitBranch};
use mino_core::TransportError;
use tauri::State;

use crate::mino::state::AppState;

use super::git::git;

#[tauri::command]
pub async fn git_branches(state: State<'_, AppState>) -> Result<Vec<GitBranch>, TransportError> {
    let transport = state.current()?;
    git(&transport)?.branches().await
}

/// Switches HEAD. The warning about an unsaved draft is the UI's job and has
/// already happened by the time a call reaches here - git knows nothing about
/// a buffer that was never written.
#[tauri::command]
pub async fn git_checkout(state: State<'_, AppState>, name: String) -> Result<(), TransportError> {
    let transport = state.current()?;
    git(&transport)?.checkout(&name).await
}

#[tauri::command]
pub async fn git_create_branch(
    state: State<'_, AppState>,
    request: CreateBranchRequest,
) -> Result<GitBranch, TransportError> {
    let transport = state.current()?;
    git(&transport)?.create_branch(request).await
}

/// `force` is the destructive form: it deletes a branch whose commits are
/// nowhere else. The confirmation is the UI's, the same way discard's is.
#[tauri::command]
pub async fn git_delete_branch(
    state: State<'_, AppState>,
    name: String,
    force: bool,
) -> Result<(), TransportError> {
    let transport = state.current()?;
    git(&transport)?.delete_branch(&name, force).await
}
