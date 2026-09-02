//! The GitHub commands. Dispatch only, like every command in this module.
//!
//! Two commands for five features, because the surface is two trait methods
//! for five features: the caller picks a `GitHubQuery` variant and Rust owns
//! the program text behind it. Ten commands here would be ten places for the
//! same dispatch to be written out.
//!
//! **No credential passes through here**, and there is none to pass. Every
//! call ends in a `gh` process that owns its own authentication in the
//! operating system keychain - see `mino_core::github`. Nothing in this file
//! reads, holds, forwards or logs a token.

use mino_core::types::{GitHubProbe, GitHubQuery, GitHubResponse};
use mino_core::{Transport, TransportError};
use std::sync::Arc;
use tauri::State;

use crate::mino::state::AppState;

#[tauri::command]
pub async fn github_probe(state: State<'_, AppState>) -> Result<GitHubProbe, TransportError> {
    let transport = state.current()?;
    github(&transport)?.probe().await
}

/// One `gh` subcommand, named by a variant.
///
/// **One of the seven variants writes.** `createPullRequest` creates something
/// public. The confirmation is the UI's job - by the time a call reaches here
/// the author has already been shown exactly what will be made - and the
/// validation in `mino_core::github::create` is what makes sure the request
/// itself is one somebody meant.
#[tauri::command]
pub async fn github_query(
    state: State<'_, AppState>,
    request: GitHubQuery,
) -> Result<GitHubResponse, TransportError> {
    let transport = state.current()?;
    github(&transport)?.query(request).await
}

/// The GitHub surface of the current transport, or the typed error saying this
/// target has none.
///
/// A different sentence from any of the probe's four answers, and deliberately
/// so: "this transport has no GitHub surface" is a fact about the build, and
/// "gh is not installed" is a fact about the machine.
fn github(
    transport: &Arc<dyn Transport>,
) -> Result<&dyn mino_core::GitHubTransport, TransportError> {
    transport
        .github()
        .ok_or_else(|| TransportError::unimplemented(transport.kind(), "github"))
}
