//! Installing the two things voice needs and cannot ship.
//!
//! Dispatch only. What is downloadable, where it lands and whether a transfer
//! finished are all `dl_voice::install`'s, where they are tested; this runs the
//! transfer on a thread and turns its progress into events.

use dl_voice::install::{self, Asset, Progress};
use serde::Serialize;
use tauri::{Emitter, Manager};

use crate::commands::AppState;

/// One installable asset, as the settings screen lists it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Installable {
    pub id: String,
    pub label: String,
    pub summary: String,
    /// Megabytes, or `None` where the size is not pinned.
    pub megabytes: Option<u64>,
    /// Whether it is already on disk.
    pub installed: bool,
}

/// Progress, pushed to the UI while a transfer runs.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgress {
    pub id: String,
    pub percent: Option<u8>,
    pub megabytes: u64,
    /// Set once, at the end. `None` while running.
    pub done: Option<bool>,
    pub error: Option<String>,
}

const MEGABYTE: u64 = 1_024 * 1_024;

/// Everything voice can install, and whether it already is.
#[tauri::command]
pub fn atlas_installable(state: tauri::State<'_, AppState>) -> Result<Vec<Installable>, String> {
    let dir = dl_config::config_dir().map_err(|e| e.to_string())?;
    let configured = state
        .engine()
        .lock()
        .map_err(|e| e.to_string())?
        .config()
        .atlas
        .voice_model
        .clone();

    Ok(install::catalogue()
        .map(|asset| Installable {
            id: asset.id.into(),
            label: asset.label.into(),
            summary: asset.summary.into(),
            megabytes: Some(asset.bytes / MEGABYTE).filter(|mb| *mb > 0),
            // A model counts as installed when it is on disk, whether or not
            // it is the one selected — otherwise switching between two you
            // already have would offer to download both again.
            installed: install::destination(asset, &dir).is_file()
                || configured.as_deref() == Some(install::destination(asset, &dir).as_path()),
        })
        .collect())
}

/// Download one asset, reporting progress on `atlas:install`.
///
/// Returns as soon as the transfer starts. It runs on its own thread because
/// it is hundreds of megabytes over somebody's home connection, and holding
/// the IPC call open for that would freeze the settings screen it was started
/// from.
#[tauri::command]
pub fn atlas_install(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let asset = install::find(&id).ok_or_else(|| format!("`{id}` is not something to install"))?;
    let dir = dl_config::config_dir().map_err(|e| e.to_string())?;

    std::thread::Builder::new()
        .name(format!("dl-install-{}", asset.id))
        .spawn(move || run(app, asset, dir))
        .map_err(|e| format!("the download could not start: {e}"))?;

    Ok(())
}

fn run(app: tauri::AppHandle, asset: &'static Asset, dir: std::path::PathBuf) {
    let emit = |progress: InstallProgress| {
        let _ = app.emit("atlas:install", progress);
    };

    // Throttled: a sixty-four kilobyte read on a fast connection is a thousand
    // events a second, and a progress bar cannot show more than the screen
    // refreshes anyway.
    let mut last = 0u8;
    let outcome = install::install(asset, &dir, |Progress { downloaded, total }| {
        let percent = Progress { downloaded, total }.percent();
        if percent.unwrap_or(0) != last || percent.is_none() {
            last = percent.unwrap_or(0);
            emit(InstallProgress {
                id: asset.id.into(),
                percent,
                megabytes: downloaded / MEGABYTE,
                done: None,
                error: None,
            });
        }
    });

    match outcome {
        Ok(path) => {
            tracing::info!(asset = asset.id, ?path, "installed");
            // Selecting it is the point of downloading it. A model that sits
            // on disk unreferenced would leave the user to edit the config by
            // hand, which is exactly what the settings screen exists to avoid.
            if let Err(e) = adopt(&app, asset, &path) {
                tracing::warn!(%e, "the downloaded asset could not be recorded in the config");
            }
            emit(InstallProgress {
                id: asset.id.into(),
                percent: Some(100),
                megabytes: 0,
                done: Some(true),
                error: None,
            });
        }
        Err(e) => {
            tracing::error!(%e, asset = asset.id, "the download failed");
            emit(InstallProgress {
                id: asset.id.into(),
                percent: None,
                megabytes: 0,
                done: Some(false),
                error: Some(e.to_string()),
            });
        }
    }
}

/// Point the config at what was just downloaded, and persist it.
///
/// Porcupine's two files need nothing recorded: they are found by directory,
/// and the default already points at where they landed.
fn adopt(app: &tauri::AppHandle, asset: &Asset, path: &std::path::Path) -> Result<(), String> {
    if asset.id.starts_with("porcupine-") {
        return Ok(());
    }

    let state = app
        .try_state::<AppState>()
        .ok_or("the shell is not ready yet")?;
    let mut engine = state.engine().lock().map_err(|e| e.to_string())?;

    let config = engine.set_voice_model(path.to_path_buf());
    dl_config::save(config).map_err(|e| e.to_string())
}
