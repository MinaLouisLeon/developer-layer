//! The IPC surface.
//!
//! Commands stay thin: they lock state, delegate to a crate, and return a
//! domain type from `dl-core` or `dl-engine`. Every type crossing this boundary
//! is `ts-rs`-generated on the TypeScript side, so the two cannot drift.
//!
//! Declaring each command here rather than scattering `invoke` calls keeps the
//! surface enumerable, which phase 07's command registry and phase 09's LLM
//! tool-calling both depend on.

use std::sync::Mutex;

use dl_core::{
    AppId, Config, DockAction, DockEntry, MetricsSnapshot, Monitor, PinnedApp, SlotId, SlotLayout,
    WindowAttributes, WindowId,
};
use dl_engine::{Engine, PassReport};
use dl_wm::edit::{Axis, Edge};

pub struct AppState {
    engine: Mutex<Engine>,
    metrics: dl_metrics::SharedMetrics,
    apps: dl_apps::AppService,
    /// Atlas's ranking memory. Its own lock, because the command bar reads it
    /// on every keystroke and the engine lock is held by tiling passes.
    recents: Mutex<dl_atlas::Recents>,
}

impl AppState {
    pub fn new(
        engine: Engine,
        metrics: dl_metrics::SharedMetrics,
        apps: dl_apps::AppService,
        recents: dl_atlas::Recents,
    ) -> Self {
        Self {
            engine: Mutex::new(engine),
            metrics,
            apps,
            recents: Mutex::new(recents),
        }
    }

    pub fn engine(&self) -> &Mutex<Engine> {
        &self.engine
    }

    pub fn apps(&self) -> &dl_apps::AppService {
        &self.apps
    }

    pub fn recents(&self) -> &Mutex<dl_atlas::Recents> {
        &self.recents
    }
}

/// Lock the engine, mapping poisoning to a message rather than panicking —
/// a poisoned lock would otherwise take down every subsequent command.
fn engine<'a>(
    state: &'a tauri::State<'_, AppState>,
) -> Result<std::sync::MutexGuard<'a, Engine>, String> {
    state.engine.lock().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_config(state: tauri::State<'_, AppState>) -> Result<Config, String> {
    Ok(engine(&state)?.config().clone())
}

#[tauri::command]
pub fn list_monitors(state: tauri::State<'_, AppState>) -> Result<Vec<Monitor>, String> {
    Ok(engine(&state)?.monitors().to_vec())
}

#[tauri::command]
pub fn list_windows(state: tauri::State<'_, AppState>) -> Result<Vec<WindowAttributes>, String> {
    engine(&state)?.windows().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_layout(state: tauri::State<'_, AppState>) -> Result<SlotLayout, String> {
    Ok(engine(&state)?.layout().clone())
}

/// Run one engine pass: observe, classify, resolve, reconcile, apply.
#[tauri::command]
pub fn run_pass(state: tauri::State<'_, AppState>) -> Result<PassReport, String> {
    engine(&state)?.pass().map_err(|e| e.to_string())
}

/// Re-enumerate displays and apply the connect/disconnect rules.
#[tauri::command]
pub fn sync_displays(state: tauri::State<'_, AppState>) -> Result<Option<String>, String> {
    let summary = engine(&state)?.sync_displays().map_err(|e| e.to_string())?;
    Ok(summary.map(|s| {
        format!(
            "{} minimised, {} restored, {} placed",
            s.minimized, s.restored, s.placed
        )
    }))
}

// ---- edit mode ----

#[tauri::command]
pub fn move_border(
    state: tauri::State<'_, AppState>,
    slot: String,
    edge: String,
    delta: f32,
) -> Result<SlotLayout, String> {
    let edge = match edge.as_str() {
        "left" => Edge::Left,
        "right" => Edge::Right,
        "top" => Edge::Top,
        "bottom" => Edge::Bottom,
        other => return Err(format!("unknown edge `{other}`")),
    };

    let mut engine = engine(&state)?;
    engine
        .move_border(&SlotId::new(slot), edge, delta)
        .map_err(|e| e.to_string())?;
    Ok(engine.layout().clone())
}

#[tauri::command]
pub fn split_slot(
    state: tauri::State<'_, AppState>,
    slot: String,
    axis: String,
    new_id: String,
) -> Result<SlotLayout, String> {
    let axis = match axis.as_str() {
        "horizontal" => Axis::Horizontal,
        "vertical" => Axis::Vertical,
        other => return Err(format!("unknown axis `{other}`")),
    };

    let mut engine = engine(&state)?;
    engine
        .split_slot(&SlotId::new(slot), axis, SlotId::new(new_id))
        .map_err(|e| e.to_string())?;
    Ok(engine.layout().clone())
}

#[tauri::command]
pub fn remove_slot(state: tauri::State<'_, AppState>, slot: String) -> Result<SlotLayout, String> {
    let mut engine = engine(&state)?;
    engine
        .remove_slot(&SlotId::new(slot))
        .map_err(|e| e.to_string())?;
    Ok(engine.layout().clone())
}

#[tauri::command]
pub fn assign_app(
    state: tauri::State<'_, AppState>,
    slot: String,
    app: Option<String>,
) -> Result<SlotLayout, String> {
    let mut engine = engine(&state)?;
    engine
        .assign_app(&SlotId::new(slot), app.map(AppId::new))
        .map_err(|e| e.to_string())?;
    Ok(engine.layout().clone())
}

/// Persist the working layout. Edits are held in memory until this is called,
/// so an experiment in edit mode can be abandoned by simply not saving.
#[tauri::command]
pub fn save_layout(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut engine = engine(&state)?;
    let config = engine.commit_layout();
    dl_config::save(config).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn is_dirty(state: tauri::State<'_, AppState>) -> Result<bool, String> {
    Ok(engine(&state)?.is_dirty())
}

// ---- telemetry ----

/// The most recent sample, or `None` before the first tick.
#[tauri::command]
pub fn latest_metrics(
    state: tauri::State<'_, AppState>,
) -> Result<Option<MetricsSnapshot>, String> {
    Ok(state
        .metrics
        .lock()
        .map_err(|e| e.to_string())?
        .latest()
        .cloned())
}

/// The newest `count` samples, oldest first.
///
/// Bounded so a caller cannot pull the whole buffer on every animation frame —
/// history lives in Rust precisely so it is not shipped repeatedly.
#[tauri::command]
pub fn metrics_history(
    state: tauri::State<'_, AppState>,
    count: usize,
) -> Result<Vec<MetricsSnapshot>, String> {
    Ok(state
        .metrics
        .lock()
        .map_err(|e| e.to_string())?
        .recent(count.min(600)))
}

// ---- dock ----

/// Discover which of the known applications are installed.
///
/// Anything not installed is simply absent: a dock entry that cannot start
/// anything is worse than no entry at all.
#[tauri::command]
pub fn discover_apps(state: tauri::State<'_, AppState>) -> Result<Vec<PinnedApp>, String> {
    Ok(state.apps.discover())
}

/// An application's icon as a PNG data URL, extracted and cached on first ask.
///
/// A data URL rather than a file path: the webview cannot read arbitrary disk
/// locations under the app's CSP, and routing icons through an asset protocol
/// would widen that for no benefit at this size.
#[tauri::command]
pub fn app_icon(state: tauri::State<'_, AppState>, app: String) -> Result<Option<String>, String> {
    let id = AppId::new(app);

    let pinned = state
        .engine
        .lock()
        .map_err(|e| e.to_string())?
        .config()
        .pinned_apps
        .iter()
        .find(|a| a.id == id)
        .cloned();

    let Some(pinned) = pinned else {
        return Ok(None);
    };

    let png = state
        .apps
        .icon(&pinned.id, &pinned.app_ref)
        .map_err(|e| e.to_string())?;

    Ok(png.map(|bytes| format!("data:image/png;base64,{}", base64(&bytes))))
}

/// Start a pinned application.
#[tauri::command]
pub fn launch_app(state: tauri::State<'_, AppState>, app: String) -> Result<(), String> {
    let id = AppId::new(app);

    let pinned = state
        .engine
        .lock()
        .map_err(|e| e.to_string())?
        .config()
        .pinned_apps
        .iter()
        .find(|a| a.id == id)
        .cloned()
        .ok_or_else(|| format!("`{id}` is not pinned"))?;

    state.apps.launch(&pinned.app_ref)
}

/// Replace the pinned application list with what discovery found, and persist.
#[tauri::command]
pub fn refresh_pinned_apps(state: tauri::State<'_, AppState>) -> Result<Vec<PinnedApp>, String> {
    let discovered = state.apps.discover();

    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    let config = engine.set_pinned_apps(discovered.clone());
    dl_config::save(config).map_err(|e| e.to_string())?;

    Ok(discovered)
}

/// Minimal base64, so an icon can cross to the webview as a data URL.
fn base64(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);

    for chunk in bytes.chunks(3) {
        let b = [
            chunk[0],
            chunk.get(1).copied().unwrap_or(0),
            chunk.get(2).copied().unwrap_or(0),
        ];
        let n = u32::from(b[0]) << 16 | u32::from(b[1]) << 8 | u32::from(b[2]);

        out.push(ALPHABET[(n >> 18 & 63) as usize] as char);
        out.push(ALPHABET[(n >> 12 & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            ALPHABET[(n >> 6 & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            ALPHABET[(n & 63) as usize] as char
        } else {
            '='
        });
    }

    out
}

#[cfg(test)]
mod tests {
    use super::base64;

    #[test]
    fn base64_matches_the_standard_encoding() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foob"), "Zm9vYg==");
        assert_eq!(base64(b"fooba"), "Zm9vYmE=");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn base64_handles_bytes_above_ascii() {
        // PNG data is binary; a signed-byte bug would corrupt every icon.
        assert_eq!(base64(&[0xFF, 0xFE, 0xFD]), "//79");
        assert_eq!(base64(&[0x89, 0x50, 0x4E, 0x47]), "iVBORw==");
    }
}

// ---- taskbar replacement ----

/// Dock entries: pinned applications plus whatever else is running.
#[tauri::command]
pub fn dock_entries(state: tauri::State<'_, AppState>) -> Result<Vec<DockEntry>, String> {
    engine(&state)?.dock().map_err(|e| e.to_string())
}

/// Record which window holds the foreground.
///
/// Drives the dock's click semantics: clicking the focused window minimises it
/// rather than re-focusing, which would look like a dead click.
#[tauri::command]
pub fn set_foreground(
    state: tauri::State<'_, AppState>,
    window: Option<u64>,
) -> Result<(), String> {
    engine(&state)?.set_foreground(window.map(WindowId));
    Ok(())
}

/// Act on a dock click.
///
/// Focus, minimise and restore happen in the engine; launching is completed
/// here because it needs `dl-apps`, which the engine deliberately does not
/// depend on.
#[tauri::command]
pub fn click_dock_entry(
    state: tauri::State<'_, AppState>,
    app: Option<String>,
) -> Result<DockAction, String> {
    let entries = engine(&state)?.dock().map_err(|e| e.to_string())?;

    let wanted = app.map(AppId::new);
    let entry = entries
        .into_iter()
        .find(|e| e.app == wanted)
        .ok_or_else(|| "no such dock entry".to_string())?;

    let action = engine(&state)?
        .click_dock_entry(&entry)
        .map_err(|e| e.to_string())?;

    if let DockAction::Launch(app) = &action {
        launch_app(state, app.as_str().to_string())?;
    }

    Ok(action)
}

/// Capture a window as a PNG data URL for a hover preview.
///
/// `None` rather than an error when there is nothing to capture: a minimised or
/// suspended window is routine, and a preview that cannot be taken is not worth
/// an error banner.
#[tauri::command]
pub fn window_thumbnail(
    state: tauri::State<'_, AppState>,
    window: u64,
) -> Result<Option<String>, String> {
    Ok(engine(&state)?
        .capture_window(WindowId(window))
        .ok()
        .map(|png| format!("data:image/png;base64,{}", base64(&png))))
}

/// Turn native-taskbar replacement on or off.
///
/// Enabling reserves the dock's edge and hides the native taskbars — but only
/// after the guardian is running, so a hard kill still puts the shell back.
#[tauri::command]
pub fn set_taskbar_replacement(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    let mut engine = engine(&state)?;
    engine
        .set_taskbar_replacement(enabled)
        .map_err(|e| e.to_string())?;

    let config = engine.config().clone();
    dl_config::save(&config).map_err(|e| e.to_string())
}
