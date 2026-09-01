//! The IPC surface.
//!
//! Commands stay thin: they validate, delegate to a crate, and return a domain
//! type from `dl-core`. Every type crossing this boundary is `ts-rs`-generated
//! on the TypeScript side, so the two cannot drift.

use std::sync::Mutex;

use dl_core::{Config, Monitor, WindowAttributes};
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

#[tauri::command]
pub fn list_windows(state: tauri::State<'_, AppState>) -> Result<Vec<WindowAttributes>, String> {
    state.shell.windows().map_err(|e| e.to_string())
}

/// Run one engine pass and report what it observed and did.
///
/// Phase 01 drives this manually; phase 02 wires it to WinEvent hooks so it
/// runs on window events instead.
#[tauri::command]
pub fn run_pass(state: tauri::State<'_, AppState>) -> Result<dl_engine::PassReport, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?.clone();

    // Layouts arrive in phase 02; until then a pass observes and classifies
    // without placing anything.
    let layout = config
        .layouts
        .iter()
        .find(|l| Some(&l.name) == config.default_layout.as_ref())
        .cloned();

    dl_engine::run_pass(state.shell.as_ref(), &config, layout.as_ref())
}
