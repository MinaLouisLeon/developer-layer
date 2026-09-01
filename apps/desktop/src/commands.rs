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

use dl_core::{AppId, Config, MetricsSnapshot, Monitor, SlotId, SlotLayout, WindowAttributes};
use dl_engine::{Engine, PassReport};
use dl_wm::edit::{Axis, Edge};

pub struct AppState {
    engine: Mutex<Engine>,
    metrics: dl_metrics::SharedMetrics,
}

impl AppState {
    pub fn new(engine: Engine, metrics: dl_metrics::SharedMetrics) -> Self {
        Self {
            engine: Mutex::new(engine),
            metrics,
        }
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
