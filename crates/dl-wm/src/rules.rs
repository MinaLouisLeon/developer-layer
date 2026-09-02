//! Deciding what to do with a window.
//!
//! The grid is strict: application windows never overlap. But applying that to
//! *every* top-level window breaks things outright — a file picker forced into
//! a slot is unusable, and a cloaked UWP ghost window is not a window at all.
//! This module draws those lines, and it is pure logic over
//! [`WindowAttributes`] so every rule is testable without Windows.
//!
//! Three outcomes:
//!
//! - **Ignore** — not a real manageable window. Never appears in the dock.
//! - **Floating** — real and shown in the dock, but exempt from the grid.
//! - **Tiled** — participates in the no-overlap grid.

use dl_core::{AppId, PinnedApp, TileMode, WindowAttributes};

/// Window classes that belong to the shell itself, never to an application.
///
/// `Progman` and `WorkerW` are the desktop; `Shell_TrayWnd` and
/// `Shell_SecondaryTrayWnd` are the taskbar we intend to replace.
const SHELL_CLASSES: &[&str] = &[
    "Progman",
    "WorkerW",
    "Shell_TrayWnd",
    "Shell_SecondaryTrayWnd",
    "Windows.UI.Core.CoreWindow",
    "ForegroundStaging",
    "MultitaskingViewFrame",
    "XamlExplorerHostIslandWindow",
    "TaskListThumbnailWnd",
];

/// Classes that are dialog-shaped by nature regardless of their styles.
const DIALOG_CLASSES: &[&str] = &[
    "#32770",
    "CabinetWClass_Dialog",
    "Credential Dialog Xaml Host",
];

/// Below this, a window is a tooltip or an offscreen stub rather than content.
const MIN_MANAGEABLE_EDGE: i32 = 80;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IgnoreReason {
    NotVisible,
    /// Windows 11 keeps these around for suspended UWP apps. Including them is
    /// the single most common cause of phantom dock entries.
    Cloaked,
    ToolWindow,
    ShellWindow,
    TooSmall,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Classification {
    Ignore(IgnoreReason),
    Manage(TileMode),
}

impl Classification {
    pub fn tile_mode(&self) -> Option<TileMode> {
        match self {
            Self::Manage(mode) => Some(*mode),
            Self::Ignore(_) => None,
        }
    }

    pub fn is_ignored(&self) -> bool {
        matches!(self, Self::Ignore(_))
    }
}

/// Per-application overrides, sourced from config.
#[derive(Debug, Default, Clone)]
pub struct Rules {
    always_float: Vec<AppId>,
}

impl Rules {
    pub fn new() -> Self {
        Self::default()
    }

    /// Build from the pinned-app list, honouring each app's `always_float`.
    ///
    /// This is the escape hatch for applications that fight `SetWindowPos` or
    /// re-assert their own geometry. That list is discovered by observing real
    /// misbehaviour, not predicted.
    pub fn from_pinned(apps: &[PinnedApp]) -> Self {
        Self {
            always_float: apps
                .iter()
                .filter(|a| a.always_float)
                .map(|a| a.id.clone())
                .collect(),
        }
    }

    pub fn float_app(&mut self, app: AppId) -> &mut Self {
        self.always_float.push(app);
        self
    }

    /// Decide what to do with a window.
    ///
    /// `app` is the resolved owning application, when one was matched. A window
    /// with no matched app is still manageable — unknown tools take the largest
    /// free general slot.
    pub fn classify(&self, w: &WindowAttributes, app: Option<&AppId>) -> Classification {
        // Exclusions first, cheapest and most decisive.
        if w.is_tool_window {
            return Classification::Ignore(IgnoreReason::ToolWindow);
        }
        if SHELL_CLASSES.contains(&w.class_name.as_str()) {
            return Classification::Ignore(IgnoreReason::ShellWindow);
        }
        if w.is_cloaked {
            return Classification::Ignore(IgnoreReason::Cloaked);
        }
        // A minimised window is legitimately not visible, and must stay
        // manageable so the dock can list it and restore it into its slot.
        if !w.is_visible && !w.is_minimized {
            return Classification::Ignore(IgnoreReason::NotVisible);
        }
        // Size is only meaningful while the window is actually on screen;
        // minimised windows report degenerate bounds.
        if !w.is_minimized
            && (w.frame_bounds.width < MIN_MANAGEABLE_EDGE
                || w.frame_bounds.height < MIN_MANAGEABLE_EDGE)
        {
            return Classification::Ignore(IgnoreReason::TooSmall);
        }

        // Managed from here. Everything below chooses tiled versus floating.
        if w.is_maximized {
            // Maximise is suppressed rather than honoured, but the window is
            // still a tile — the reconcile pass restores and re-places it.
            return Classification::Manage(TileMode::Tiled);
        }
        if let Some(app) = app {
            if self.always_float.contains(app) {
                return Classification::Manage(TileMode::Floating);
            }
        }
        if w.has_owner {
            // Owned means a dialog belonging to another window: file pickers,
            // Postman's request dialogs, settings sheets.
            return Classification::Manage(TileMode::Floating);
        }
        if DIALOG_CLASSES.contains(&w.class_name.as_str()) {
            return Classification::Manage(TileMode::Floating);
        }
        if !w.is_resizable {
            // Nothing is gained by assigning a slot to a window that cannot
            // fill it.
            return Classification::Manage(TileMode::Floating);
        }

        Classification::Manage(TileMode::Tiled)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dl_core::{AppRef, Rect, WindowId};

    /// A well-behaved, tileable application window.
    fn window() -> WindowAttributes {
        WindowAttributes {
            id: WindowId(1),
            title: "Visual Studio Code".into(),
            class_name: "Chrome_WidgetWin_1".into(),
            executable: None,
            aumid: None,
            outer_bounds: Rect::new(-7, 0, 1934, 1047),
            frame_bounds: Rect::new(0, 0, 1920, 1040),
            is_visible: true,
            is_cloaked: false,
            is_tool_window: false,
            has_owner: false,
            is_resizable: true,
            is_minimized: false,
            is_maximized: false,
        }
    }

    #[test]
    fn an_ordinary_app_window_tiles() {
        assert_eq!(
            Rules::new().classify(&window(), None),
            Classification::Manage(TileMode::Tiled)
        );
    }

    #[test]
    fn cloaked_windows_are_ignored_entirely() {
        // The Windows 11 UWP ghost. Without this the dock fills with phantoms.
        let mut w = window();
        w.is_cloaked = true;

        assert_eq!(
            Rules::new().classify(&w, None),
            Classification::Ignore(IgnoreReason::Cloaked)
        );
    }

    #[test]
    fn owned_dialogs_float_instead_of_tiling() {
        // A file picker forced into a slot is unusable.
        let mut w = window();
        w.has_owner = true;
        w.title = "Open File".into();

        assert_eq!(
            Rules::new().classify(&w, None),
            Classification::Manage(TileMode::Floating)
        );
    }

    #[test]
    fn non_resizable_windows_float() {
        let mut w = window();
        w.is_resizable = false;

        assert_eq!(
            Rules::new().classify(&w, None),
            Classification::Manage(TileMode::Floating)
        );
    }

    #[test]
    fn dialog_classes_float_even_without_an_owner() {
        let mut w = window();
        w.class_name = "#32770".into();

        assert_eq!(
            Rules::new().classify(&w, None),
            Classification::Manage(TileMode::Floating)
        );
    }

    #[test]
    fn shell_windows_are_never_managed() {
        for class in ["Progman", "WorkerW", "Shell_TrayWnd"] {
            let mut w = window();
            w.class_name = class.into();

            assert_eq!(
                Rules::new().classify(&w, None),
                Classification::Ignore(IgnoreReason::ShellWindow),
                "{class} belongs to the shell, not to an application"
            );
        }
    }

    #[test]
    fn tool_windows_are_ignored() {
        let mut w = window();
        w.is_tool_window = true;

        assert_eq!(
            Rules::new().classify(&w, None),
            Classification::Ignore(IgnoreReason::ToolWindow)
        );
    }

    #[test]
    fn the_atlas_command_bar_is_ignored_because_it_is_a_tool_window() {
        // Our own overlay floats over everything and must never be tiled into
        // somebody's workspace. It is declared with `skipTaskbar` in
        // `tauri.conf.json`, which is `WS_EX_TOOLWINDOW` on Windows — so this
        // rule is what actually keeps it out of the grid, and it would be an
        // easy thing to lose while tidying the classifier.
        let mut bar = window();
        bar.is_tool_window = true;
        bar.title = "Atlas".into();
        // Ordinary in every other respect: visible, resizable, big enough.
        bar.outer_bounds = Rect::new(600, 300, 720, 440);
        bar.frame_bounds = Rect::new(600, 300, 720, 440);

        assert!(Rules::new().classify(&bar, None).is_ignored());
    }

    #[test]
    fn minimized_windows_stay_manageable_so_the_dock_can_restore_them() {
        // Minimised windows are not visible and report degenerate bounds, but
        // dropping them here would make them unrecoverable from the dock —
        // which is exactly where disconnect-orphaned windows live.
        let mut w = window();
        w.is_minimized = true;
        w.is_visible = false;
        w.frame_bounds = Rect::new(-32000, -32000, 0, 0);

        assert_eq!(
            Rules::new().classify(&w, None),
            Classification::Manage(TileMode::Tiled)
        );
    }

    #[test]
    fn genuinely_hidden_windows_are_ignored() {
        let mut w = window();
        w.is_visible = false;

        assert_eq!(
            Rules::new().classify(&w, None),
            Classification::Ignore(IgnoreReason::NotVisible)
        );
    }

    #[test]
    fn tooltip_sized_windows_are_ignored() {
        let mut w = window();
        w.frame_bounds = Rect::new(0, 0, 40, 24);

        assert_eq!(
            Rules::new().classify(&w, None),
            Classification::Ignore(IgnoreReason::TooSmall)
        );
    }

    #[test]
    fn a_maximized_window_is_still_a_tile() {
        // Maximise is suppressed, not honoured: reconcile restores it and puts
        // it back in its slot rather than letting it cover the screen.
        let mut w = window();
        w.is_maximized = true;

        assert_eq!(
            Rules::new().classify(&w, None),
            Classification::Manage(TileMode::Tiled)
        );
    }

    #[test]
    fn per_app_float_rule_overrides_tiling() {
        // The escape hatch for apps that fight SetWindowPos.
        let mut rules = Rules::new();
        rules.float_app(AppId::new("winrar"));

        assert_eq!(
            rules.classify(&window(), Some(&AppId::new("winrar"))),
            Classification::Manage(TileMode::Floating)
        );
        assert_eq!(
            rules.classify(&window(), Some(&AppId::new("vscode"))),
            Classification::Manage(TileMode::Tiled)
        );
    }

    #[test]
    fn rules_are_built_from_the_pinned_app_list() {
        let pinned = vec![
            PinnedApp {
                id: AppId::new("vscode"),
                display_name: "VS Code".into(),
                app_ref: AppRef::executable(r"C:\code.exe"),
                icon_key: None,
                always_float: false,
            },
            PinnedApp {
                id: AppId::new("legacy-tool"),
                display_name: "Legacy Tool".into(),
                app_ref: AppRef::executable(r"C:\legacy.exe"),
                icon_key: None,
                always_float: true,
            },
        ];

        let rules = Rules::from_pinned(&pinned);

        assert_eq!(
            rules.classify(&window(), Some(&AppId::new("legacy-tool"))),
            Classification::Manage(TileMode::Floating)
        );
        assert_eq!(
            rules.classify(&window(), Some(&AppId::new("vscode"))),
            Classification::Manage(TileMode::Tiled)
        );
    }

    #[test]
    fn exclusion_beats_float_rules() {
        // A cloaked window belonging to a float-listed app is still not a
        // window; ordering of the checks matters.
        let mut w = window();
        w.is_cloaked = true;
        let mut rules = Rules::new();
        rules.float_app(AppId::new("whatsapp"));

        assert!(rules
            .classify(&w, Some(&AppId::new("whatsapp")))
            .is_ignored());
    }
}
