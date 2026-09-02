//! The command bar's IPC surface, and the effect dispatcher.
//!
//! Thin on purpose. Every decision — what the palette holds, how a query
//! ranks, what "open Chrome" means when Chrome is already open — is made in
//! `dl-atlas`, where it is tested without a desktop. What is left here is
//! turning an [`Effect`] into the one call that carries it out.
//!
//! The palette is rebuilt on every query rather than cached. It is a handful
//! of applications and whatever is open, which is nothing next to the IPC
//! round trip, and a cache would go stale exactly when it matters: the moment
//! after something was opened or closed.

use dl_atlas::{AtlasHit, Context, Effect, Invocation, Recents, Surface};
use dl_core::AppId;
use tauri::{Emitter, Manager};

use crate::commands::AppState;

/// Rank the palette for `query`.
#[tauri::command]
pub fn atlas_search(
    state: tauri::State<'_, AppState>,
    query: String,
) -> Result<Vec<AtlasHit>, String> {
    let engine = state.engine().lock().map_err(|e| e.to_string())?;
    let dock = engine.dock().map_err(|e| e.to_string())?;
    let config = engine.config().clone();

    let context = Context {
        installed: &config.pinned_apps,
        dock: &dock,
        taskbar_hidden: config.general.replace_native_taskbar,
    };

    let entries = dl_atlas::palette::build(&context);
    let recents = state.recents().lock().map_err(|e| e.to_string())?;

    Ok(dl_atlas::view::search(&entries, &query, &recents))
}

/// Run the row `key` names.
#[tauri::command]
pub fn atlas_run(app: tauri::AppHandle, key: String) -> Result<(), String> {
    run_key(&app, &key)
}

/// Run an invocation key, whatever produced it.
///
/// The command bar calls this with a row the user chose; the voice thread
/// calls it with a phrase `dl-atlas` resolved from what was said. Both go
/// through one path on purpose — a second dispatcher would be a second place
/// for the two to disagree about what a key means, and the spoken one is the
/// half nobody is watching.
pub fn run_key(app: &tauri::AppHandle, key: &str) -> Result<(), String> {
    let state = app
        .try_state::<AppState>()
        .ok_or("the shell is not ready yet")?;

    let invocation = Invocation::parse(key).map_err(|e| e.to_string())?;

    let effect = {
        let engine = state.engine().lock().map_err(|e| e.to_string())?;
        let dock = engine.dock().map_err(|e| e.to_string())?;
        let config = engine.config().clone();
        let context = Context {
            installed: &config.pinned_apps,
            dock: &dock,
            taskbar_hidden: config.general.replace_native_taskbar,
        };
        dl_atlas::plan::plan(&invocation, &context).map_err(|e| e.to_string())?
    };

    // Recorded before the effect runs, not after: `Effect::Quit` never
    // returns, and quitting is worth remembering having done.
    remember(&state, key);

    apply(app, &state, effect)
}

/// Show or hide the command bar. Called by the hotkey and by the bar itself
/// when it is dismissed.
#[tauri::command]
pub fn atlas_toggle(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
    set_visible(&app, visible)
}

fn remember(state: &tauri::State<'_, AppState>, key: &str) {
    let Ok(mut recents) = state.recents().lock() else {
        return;
    };
    recents.record(key);
    // Failing to write the recents file is not worth failing the command the
    // user actually asked for; the ranking is simply colder next time.
    if let Err(e) = dl_config::save_recents(recents.keys()) {
        tracing::warn!(%e, "could not save the recent command list");
    }
}

fn apply(
    app: &tauri::AppHandle,
    state: &tauri::State<'_, AppState>,
    effect: Effect,
) -> Result<(), String> {
    match effect {
        Effect::LaunchApp(id) => launch(state, &id),
        Effect::FocusWindow(window) => {
            let mut engine = state.engine().lock().map_err(|e| e.to_string())?;
            engine.focus_window(window).map_err(|e| e.to_string())
        }
        Effect::MinimizeWindow(window) => {
            let mut engine = state.engine().lock().map_err(|e| e.to_string())?;
            engine.minimize_window(window).map_err(|e| e.to_string())
        }
        Effect::RestoreWindows(windows) => {
            let mut engine = state.engine().lock().map_err(|e| e.to_string())?;
            engine.restore_windows(&windows);
            Ok(())
        }
        Effect::Retile => {
            let mut engine = state.engine().lock().map_err(|e| e.to_string())?;
            engine.pass().map(|_| ()).map_err(|e| e.to_string())
        }
        Effect::SyncDisplays => {
            let mut engine = state.engine().lock().map_err(|e| e.to_string())?;
            engine
                .sync_displays()
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
        Effect::SaveLayout => {
            let mut engine = state.engine().lock().map_err(|e| e.to_string())?;
            dl_config::save(engine.commit_layout()).map_err(|e| e.to_string())
        }
        // The only effect the shell window owns rather than the engine: edit
        // mode is a UI state, so it is raised and told, not toggled from here.
        Effect::EditLayout => {
            focus_surface(app, crate::SHELL_WINDOW)?;
            app.emit_to(crate::SHELL_WINDOW, "atlas:edit-layout", ())
                .map_err(|e| e.to_string())
        }
        Effect::SetTaskbarReplacement(hidden) => {
            let mut engine = state.engine().lock().map_err(|e| e.to_string())?;
            engine
                .set_taskbar_replacement(hidden)
                .map_err(|e| e.to_string())?;
            dl_config::save(engine.config()).map_err(|e| e.to_string())
        }
        Effect::Open(Surface::Shell) => focus_surface(app, crate::SHELL_WINDOW),
        Effect::Open(Surface::Workbench) => focus_surface(app, crate::MINO_WINDOW),
        Effect::Quit => {
            // Through the same path as a window close, so the native taskbar
            // is restored on the way out rather than left hidden.
            app.exit(0);
            Ok(())
        }
    }
}

fn launch(state: &tauri::State<'_, AppState>, id: &AppId) -> Result<(), String> {
    let app_ref = state
        .engine()
        .lock()
        .map_err(|e| e.to_string())?
        .config()
        .pinned_apps
        .iter()
        .find(|a| &a.id == id)
        .map(|a| a.app_ref.clone())
        .ok_or_else(|| format!("`{id}` is not installed"))?;

    state.apps().launch(&app_ref)
}

fn focus_surface(app: &tauri::AppHandle, label: &str) -> Result<(), String> {
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| format!("there is no `{label}` window"))?;
    window.show().map_err(|e| e.to_string())?;
    window.unminimize().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

/// Show or hide the command bar overlay.
///
/// Showing focuses it, or the user would be typing into whatever was in front.
/// Hiding is the only thing the bar does on Escape — it is never closed, since
/// recreating a window on every hotkey press is visibly slower than showing
/// one that already exists.
pub fn set_visible(app: &tauri::AppHandle, visible: bool) -> Result<(), String> {
    let window = app
        .get_webview_window(crate::ATLAS_WINDOW)
        .ok_or("the command bar window is missing")?;

    if visible {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        // Cleared on every open: a query left from last time would have the
        // first keystroke append to something invisible above the fold.
        app.emit_to(crate::ATLAS_WINDOW, "atlas:opened", ())
            .map_err(|e| e.to_string())
    } else {
        window.hide().map_err(|e| e.to_string())
    }
}

/// Toggle the bar, which is what the hotkey does.
pub fn toggle(app: &tauri::AppHandle) {
    let visible = app
        .get_webview_window(crate::ATLAS_WINDOW)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);

    if let Err(e) = set_visible(app, !visible) {
        tracing::error!(%e, "could not toggle the command bar");
    }
}

/// Load the persisted recents, filtered to keys the registry still knows.
///
/// An action removed or renamed in an upgrade leaves keys behind that would
/// otherwise sit in the list forever, boosting nothing and taking a slot from
/// something real.
pub fn load_recents() -> Recents {
    let stored = dl_config::load_recents()
        .into_iter()
        .filter(|key| Invocation::parse(key).is_ok())
        .collect();
    Recents::new(stored)
}

/// What voice can do as configured, for the settings screen and the overlay.
#[tauri::command]
pub fn atlas_voice_capability(
    state: tauri::State<'_, AppState>,
) -> Result<dl_atlas::Capability, String> {
    state
        .voice_capability()
        .lock()
        .map(|c| c.clone())
        .map_err(|e| e.to_string())
}

/// Push-to-talk, and the answers to a spoken confirmation.
///
/// One command rather than four, because they are one conversation and the UI
/// should not be able to get them out of order by calling the wrong one.
#[tauri::command]
pub fn atlas_voice(state: tauri::State<'_, AppState>, action: String) -> Result<(), String> {
    use crate::voice::Request;

    let request = match action.as_str() {
        "press" => Request::Press,
        "release" => Request::Release,
        "cancel" => Request::Cancel,
        "yes" => Request::Answer(true),
        "no" => Request::Answer(false),
        "enable" => Request::Enabled(true),
        // Switching off closes the microphone and drops the model through the
        // session's own disable path, rather than by leaving a thread running
        // that quietly ignores everything.
        "disable" => Request::Enabled(false),
        other => return Err(format!("`{other}` is not a voice action")),
    };

    state
        .voice()
        .send(request)
        // The thread is gone, which means voice was never started or has
        // stopped. Saying so beats a button that silently does nothing.
        .map_err(|_| "voice is not running".to_string())
}
