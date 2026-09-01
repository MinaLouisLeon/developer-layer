//! The IPC surface.
//!
//! Commands stay thin: they validate, delegate to a crate, and return a domain
//! type from `dl-core`. Every type crossing this boundary is `ts-rs`-generated
//! on the TypeScript side, so the two cannot drift.

use std::sync::Mutex;

use dl_core::{Config, Monitor};
use dl_platform::ShellIntegration;

pub struct AppState {
    shell: Box<dyn ShellIntegration>,
    config: Mutex<Config>,
}

impl AppState {
    pub fn new(shell: Box<dyn ShellIntegration>) -> Self {
        Self {
            shell,
            config: Mutex::new(Config::default()),
        }
    }
}

#[tauri::command]
pub fn get_config(state: tauri::State<'_, AppState>) -> Result<Config, String> {
    state
        .config
        .lock()
        .map(|c| c.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_monitors(state: tauri::State<'_, AppState>) -> Result<Vec<Monitor>, String> {
    state.shell.monitors().map_err(|e| e.to_string())
}
