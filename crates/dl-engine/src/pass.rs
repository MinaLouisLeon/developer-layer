//! One pass of the slot engine.
//!
//! Observe → classify → resolve → reconcile → apply. Every stage except the
//! first and last is pure logic in `dl-wm`, which is why the rules governing
//! the workspace are tested rather than trusted.

use std::collections::HashMap;

use dl_core::{AppId, Config, Monitor, SlotLayout, TileMode, WindowAttributes, WindowId};
use dl_platform::ShellIntegration;
use dl_wm::{reconcile, Classification, Operation, Resolver, Rules, DEFAULT_TOLERANCE};

/// What a single pass observed and did. Returned so the UI can show it and the
/// logs can explain why a window did or did not move.
#[derive(Debug, Default, Clone, serde::Serialize, serde::Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct PassReport {
    pub monitors: u32,
    pub observed: u32,
    pub tiled: u32,
    pub floating: u32,
    pub ignored: u32,
    pub operations: u32,
    /// Windows that refused an operation. Repeated entries here are the signal
    /// to add a float rule for that application.
    pub failures: Vec<String>,
}

pub fn run_pass(
    shell: &dyn ShellIntegration,
    config: &Config,
    layout: Option<&SlotLayout>,
) -> Result<PassReport, String> {
    let monitors: Vec<Monitor> = shell.monitors().map_err(|e| e.to_string())?;
    let observed: Vec<WindowAttributes> = shell.windows().map_err(|e| e.to_string())?;

    let mut report = PassReport {
        monitors: monitors.len() as u32,
        observed: observed.len() as u32,
        ..Default::default()
    };

    let rules = Rules::from_pinned(&config.pinned_apps);
    let mut modes: HashMap<WindowId, TileMode> = HashMap::new();
    let mut tiled = Vec::new();

    for window in &observed {
        let app = resolve_app(window, config);
        match rules.classify(window, app.as_ref()) {
            Classification::Ignore(_) => report.ignored += 1,
            Classification::Manage(TileMode::Tiled) => {
                report.tiled += 1;
                modes.insert(window.id, TileMode::Tiled);
                tiled.push(to_record(window, app));
            }
            Classification::Manage(mode) => {
                report.floating += 1;
                modes.insert(window.id, mode);
            }
        }
    }

    // Without a layout there is nothing to place against. Observing is still
    // useful — the dock lists windows before any layout exists.
    let Some(layout) = layout else {
        return Ok(report);
    };

    let placements = Resolver::new(layout, &monitors).resolve(&tiled);
    let operations = reconcile(&placements, &observed, &modes, DEFAULT_TOLERANCE);
    report.operations = operations.len() as u32;

    for op in operations {
        if let Err(err) = apply(shell, &op) {
            // One stubborn window must not abort the pass for every other one.
            // Repeated failures here are the signal to add a float rule.
            report.failures.push(format!("{:?}: {err}", op.window()));
        }
    }

    Ok(report)
}

fn apply(shell: &dyn ShellIntegration, op: &Operation) -> Result<(), String> {
    match op {
        Operation::SetBounds { window, outer } => shell.set_window_bounds(*window, *outer),
        Operation::Restore { window } => shell.restore_window(*window),
        Operation::SuppressMaximize { window } => shell.suppress_maximize(*window),
    }
    .map_err(|e| e.to_string())
}

/// Match an observed window to a pinned application.
///
/// AUMID is checked first: packaged apps such as WhatsApp report an executable
/// path belonging to the UWP host rather than to themselves, so matching on
/// path alone would collapse every Store app into one.
fn resolve_app(window: &WindowAttributes, config: &Config) -> Option<AppId> {
    use dl_core::AppRef;

    if let Some(aumid) = &window.aumid {
        if let Some(app) = config
            .pinned_apps
            .iter()
            .find(|a| matches!(&a.app_ref, AppRef::Packaged { aumid: pinned } if pinned == aumid))
        {
            return Some(app.id.clone());
        }
    }

    let exe = window.executable.as_ref()?;
    config
        .pinned_apps
        .iter()
        .find(|a| match &a.app_ref {
            AppRef::Executable { path, .. } => paths_match(path, exe),
            AppRef::Packaged { .. } => false,
        })
        .map(|a| a.id.clone())
}

/// Compare executable paths case-insensitively on the file name.
///
/// Squirrel-packaged apps such as Slack move between versioned directories on
/// every update, so a full-path comparison would silently stop matching after
/// an upgrade.
fn paths_match(pinned: &std::path::Path, observed: &std::path::Path) -> bool {
    match (basename(pinned), basename(observed)) {
        (Some(a), Some(b)) => a.eq_ignore_ascii_case(b),
        _ => false,
    }
}

/// Last path component of a **Windows** path, split on both separators.
///
/// `Path::file_name` is host-dependent: on Linux it does not treat `\` as a
/// separator, so `C:\a\b.exe` comes back whole. These paths are always
/// Windows paths regardless of where the code runs, and CI runs on Linux — so
/// relying on the host's rules would make the tests disagree with production.
fn basename(path: &std::path::Path) -> Option<&str> {
    let s = path.to_str()?;
    Some(match s.rsplit_once(['\\', '/']) {
        Some((_, name)) => name,
        None => s,
    })
}

fn to_record(window: &WindowAttributes, app: Option<AppId>) -> dl_core::WindowRecord {
    dl_core::WindowRecord {
        id: window.id,
        app_id: app,
        title: window.title.clone(),
        monitor: None,
        slot: None,
        tile_mode: TileMode::Tiled,
        // Minimised windows keep their slot reserved; reconcile declines to
        // move them, so they return to the right place when restored.
        minimized: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dl_core::{AppRef, PinnedApp, Rect};
    use std::path::PathBuf;

    fn pinned() -> Vec<PinnedApp> {
        vec![
            PinnedApp {
                id: AppId::new("slack"),
                display_name: "Slack".into(),
                app_ref: AppRef::executable(
                    r"C:\Users\m\AppData\Local\slack\app-4.35.126\slack.exe",
                ),
                icon_key: None,
                always_float: false,
            },
            PinnedApp {
                id: AppId::new("whatsapp"),
                display_name: "WhatsApp".into(),
                app_ref: AppRef::packaged("5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App"),
                icon_key: None,
                always_float: false,
            },
        ]
    }

    fn window(exe: Option<&str>, aumid: Option<&str>) -> WindowAttributes {
        WindowAttributes {
            id: WindowId(1),
            title: "window".into(),
            class_name: "Chrome_WidgetWin_1".into(),
            executable: exe.map(PathBuf::from),
            aumid: aumid.map(str::to_string),
            outer_bounds: Rect::new(0, 0, 100, 100),
            frame_bounds: Rect::new(0, 0, 100, 100),
            is_visible: true,
            is_cloaked: false,
            is_tool_window: false,
            has_owner: false,
            is_resizable: true,
            is_minimized: false,
            is_maximized: false,
        }
    }

    fn config() -> Config {
        Config {
            pinned_apps: pinned(),
            ..Default::default()
        }
    }

    #[test]
    fn slack_still_matches_after_an_update_moves_its_directory() {
        // Squirrel relocates the exe on every update; a full-path comparison
        // would silently stop matching and Slack would lose its slot.
        let updated = window(
            Some(r"C:\Users\m\AppData\Local\slack\app-4.40.0\slack.exe"),
            None,
        );

        assert_eq!(resolve_app(&updated, &config()), Some(AppId::new("slack")));
    }

    #[test]
    fn packaged_apps_match_on_aumid_not_path() {
        // Store apps report the UWP host's executable, which is shared. Path
        // matching alone would collapse every packaged app into one identity.
        let whatsapp = window(
            Some(r"C:\Program Files\WindowsApps\...\WhatsApp.exe"),
            Some("5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App"),
        );

        assert_eq!(
            resolve_app(&whatsapp, &config()),
            Some(AppId::new("whatsapp"))
        );
    }

    #[test]
    fn basename_splits_windows_paths_on_any_host() {
        // Path::file_name would return the whole string on Linux, making these
        // tests pass locally and the matching fail on Windows.
        assert_eq!(
            basename(&PathBuf::from(r"C:\Program Files\Google\chrome.exe")),
            Some("chrome.exe")
        );
        assert_eq!(basename(&PathBuf::from("chrome.exe")), Some("chrome.exe"));
    }

    #[test]
    fn an_unknown_window_matches_nothing() {
        assert_eq!(
            resolve_app(&window(Some(r"C:\other.exe"), None), &config()),
            None
        );
        assert_eq!(resolve_app(&window(None, None), &config()), None);
    }

    #[test]
    fn a_pass_without_a_layout_still_observes() {
        // The dock needs the window list before any layout exists.
        let report = run_pass(&dl_platform::NullShell, &config(), None).expect("pass");
        assert_eq!(report.operations, 0);
    }
}
