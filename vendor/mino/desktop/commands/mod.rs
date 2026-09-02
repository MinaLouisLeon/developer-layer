//! Tauri commands.
//!
//! Every command here is dispatch only: take the current transport from
//! `AppState`, call one trait method, return its result. No filesystem call,
//! no process spawn and no business logic may appear in this module - that is
//! the architectural rule the whole project is built around.
//!
//! The submodules are public and `generate_handler!` refers to full paths
//! (`commands::fs::list_dir`), because `#[tauri::command]` generates a macro
//! beside each function: a re-export of the function alone would leave the
//! macro behind and fail to resolve.

pub mod connection;
pub mod fs;
pub mod git;
pub mod git_branches;
pub mod git_history;
pub mod git_remote;
pub mod git_stash;
pub mod github;
pub mod pty;
pub mod shell;
