//! Dock state and click semantics.
//!
//! The dock is a taskbar replacement, so it has to answer two questions that
//! sound simple and are not:
//!
//! 1. **What appears, and in what order?** Pinned applications are always
//!    present whether running or not — a dock whose icons move as apps start
//!    and stop destroys the muscle memory that makes a fixed workspace worth
//!    having. Running applications that are not pinned append after them.
//! 2. **What does a click do?** It depends on the entry's state, and getting it
//!    wrong is the difference between a taskbar and an annoyance. Clicking a
//!    focused window should minimise it, not re-focus it; clicking one of
//!    several windows should cycle rather than always picking the first.
//!
//! Both are pure logic over observed state, so both are tested rather than
//! discovered by clicking around. The types themselves live in `dl-core`
//! because they cross IPC; only the rules are here.

use dl_core::{AppId, DockAction, DockEntry, DockWindow, PinnedApp, WindowId};

/// Assemble dock entries from pinned applications and observed windows.
///
/// `foreground` is the window currently holding focus, if any.
pub fn build(
    pinned: &[PinnedApp],
    windows: &[(Option<AppId>, DockWindow)],
    foreground: Option<WindowId>,
) -> Vec<DockEntry> {
    let mut entries: Vec<DockEntry> = pinned
        .iter()
        .map(|app| DockEntry {
            app: Some(app.id.clone()),
            display_name: app.display_name.clone(),
            pinned: true,
            windows: Vec::new(),
            active: false,
        })
        .collect();

    for (app_id, window) in windows {
        let index = match app_id {
            Some(id) => entries.iter().position(|e| e.app.as_ref() == Some(id)),
            None => None,
        };

        match index {
            Some(index) => entries[index].windows.push(window.clone()),
            None => {
                // Running but not pinned. Grouped by app when it has one, so a
                // second Chrome window joins the first rather than opening a
                // second entry; otherwise each unidentified window stands alone.
                let existing = app_id.as_ref().and_then(|id| {
                    entries
                        .iter()
                        .position(|e| !e.pinned && e.app.as_ref() == Some(id))
                });

                match existing {
                    Some(index) => entries[index].windows.push(window.clone()),
                    None => entries.push(DockEntry {
                        app: app_id.clone(),
                        display_name: window.title.clone(),
                        pinned: false,
                        windows: vec![window.clone()],
                        active: false,
                    }),
                }
            }
        }
    }

    if let Some(foreground) = foreground {
        for entry in &mut entries {
            entry.active = entry.windows.iter().any(|w| w.id == foreground);
        }
    }

    entries
}

/// Decide what clicking an entry means.
pub fn on_click(entry: &DockEntry, foreground: Option<WindowId>) -> DockAction {
    if !entry.is_running() {
        return match &entry.app {
            Some(app) => DockAction::Launch(app.clone()),
            None => DockAction::Nothing,
        };
    }

    // Everything is in the dock: the intent is plainly to get it back, and
    // restoring only one of several would be a half-answer.
    if entry.fully_minimized() {
        return DockAction::RestoreAll(entry.windows.iter().map(|w| w.id).collect());
    }

    let visible: Vec<&DockWindow> = entry.windows.iter().filter(|w| !w.minimized).collect();

    // Clicking the window you are already in means "put it away". Re-focusing
    // something already focused does nothing visible, which reads as a dead
    // click.
    if let Some(foreground) = foreground {
        if visible.len() == 1 && visible[0].id == foreground {
            return DockAction::Minimize(foreground);
        }

        if visible.len() > 1 {
            if let Some(position) = visible.iter().position(|w| w.id == foreground) {
                // Wrap round rather than stopping at the end, so repeated
                // clicks walk the whole group.
                let next = visible[(position + 1) % visible.len()];
                return DockAction::Cycle(next.id);
            }
        }
    }

    // Not focused: bring the first visible window forward.
    match visible.first() {
        Some(window) => DockAction::Focus(window.id),
        // Nothing visible but not fully minimised is not reachable in practice;
        // treating it as a restore is the safe reading.
        None => DockAction::RestoreAll(entry.windows.iter().map(|w| w.id).collect()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dl_core::AppRef;

    fn pinned(ids: &[&str]) -> Vec<PinnedApp> {
        ids.iter()
            .map(|id| PinnedApp {
                id: AppId::new(*id),
                display_name: id.to_uppercase(),
                app_ref: AppRef::executable(format!(r"C:\{id}.exe")),
                icon_key: None,
                always_float: false,
            })
            .collect()
    }

    fn window(id: u64, title: &str, minimized: bool) -> DockWindow {
        DockWindow {
            id: WindowId(id),
            title: title.into(),
            minimized,
        }
    }

    fn entry(app: &str, windows: Vec<DockWindow>) -> DockEntry {
        DockEntry {
            app: Some(AppId::new(app)),
            display_name: app.into(),
            pinned: true,
            windows,
            active: false,
        }
    }

    #[test]
    fn pinned_apps_appear_even_when_nothing_is_running() {
        // A dock whose icons come and go destroys muscle memory.
        let entries = build(&pinned(&["chrome", "slack"]), &[], None);

        assert_eq!(entries.len(), 2);
        assert!(entries.iter().all(|e| e.pinned && !e.is_running()));
    }

    #[test]
    fn pinned_order_is_preserved_regardless_of_launch_order() {
        let apps = pinned(&["chrome", "slack", "vscode"]);
        // Slack started first; it must not jump to the front.
        let windows = vec![
            (Some(AppId::new("slack")), window(1, "Slack", false)),
            (Some(AppId::new("chrome")), window(2, "Chrome", false)),
        ];

        let entries = build(&apps, &windows, None);

        let order: Vec<_> = entries.iter().filter_map(|e| e.app.clone()).collect();
        assert_eq!(
            order,
            vec![
                AppId::new("chrome"),
                AppId::new("slack"),
                AppId::new("vscode")
            ]
        );
    }

    #[test]
    fn several_windows_of_one_app_group_into_one_entry() {
        let windows = vec![
            (Some(AppId::new("chrome")), window(1, "Tab A", false)),
            (Some(AppId::new("chrome")), window(2, "Tab B", false)),
        ];

        let entries = build(&pinned(&["chrome"]), &windows, None);

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].window_count(), 2);
    }

    #[test]
    fn a_running_unpinned_app_appends_after_the_pinned_ones() {
        let windows = vec![(Some(AppId::new("notepad")), window(1, "Notepad", false))];

        let entries = build(&pinned(&["chrome"]), &windows, None);

        assert_eq!(entries.len(), 2);
        assert!(entries[0].pinned);
        assert!(!entries[1].pinned);
    }

    #[test]
    fn two_windows_of_an_unpinned_app_still_share_one_entry() {
        let windows = vec![
            (Some(AppId::new("notepad")), window(1, "A", false)),
            (Some(AppId::new("notepad")), window(2, "B", false)),
        ];

        let entries = build(&[], &windows, None);

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].window_count(), 2);
    }

    #[test]
    fn the_entry_owning_the_foreground_window_is_marked_active() {
        let windows = vec![
            (Some(AppId::new("chrome")), window(1, "Chrome", false)),
            (Some(AppId::new("slack")), window(2, "Slack", false)),
        ];

        let entries = build(&pinned(&["chrome", "slack"]), &windows, Some(WindowId(2)));

        assert!(!entries[0].active);
        assert!(entries[1].active);
    }

    #[test]
    fn clicking_a_stopped_app_launches_it() {
        let e = entry("chrome", vec![]);

        assert_eq!(on_click(&e, None), DockAction::Launch(AppId::new("chrome")));
    }

    #[test]
    fn clicking_an_unfocused_window_focuses_it() {
        let e = entry("chrome", vec![window(1, "Chrome", false)]);

        assert_eq!(on_click(&e, None), DockAction::Focus(WindowId(1)));
    }

    #[test]
    fn clicking_the_focused_window_minimises_it() {
        // Re-focusing something already focused does nothing visible, which
        // reads as a dead click.
        let e = entry("chrome", vec![window(1, "Chrome", false)]);

        assert_eq!(
            on_click(&e, Some(WindowId(1))),
            DockAction::Minimize(WindowId(1))
        );
    }

    #[test]
    fn clicking_a_fully_minimised_app_restores_every_window() {
        // Restoring only one of several would be a half-answer to an obvious
        // intent.
        let e = entry("chrome", vec![window(1, "A", true), window(2, "B", true)]);

        assert_eq!(
            on_click(&e, None),
            DockAction::RestoreAll(vec![WindowId(1), WindowId(2)])
        );
    }

    #[test]
    fn clicking_a_group_cycles_to_the_next_window() {
        let e = entry(
            "chrome",
            vec![
                window(1, "A", false),
                window(2, "B", false),
                window(3, "C", false),
            ],
        );

        assert_eq!(
            on_click(&e, Some(WindowId(1))),
            DockAction::Cycle(WindowId(2))
        );
        assert_eq!(
            on_click(&e, Some(WindowId(2))),
            DockAction::Cycle(WindowId(3))
        );
    }

    #[test]
    fn cycling_wraps_round_to_the_first_window() {
        // Stopping at the end would strand you needing a different route back.
        let e = entry("chrome", vec![window(1, "A", false), window(2, "B", false)]);

        assert_eq!(
            on_click(&e, Some(WindowId(2))),
            DockAction::Cycle(WindowId(1))
        );
    }

    #[test]
    fn cycling_skips_minimised_windows() {
        // A cycle that lands on something invisible looks like the click did
        // nothing at all.
        let e = entry(
            "chrome",
            vec![
                window(1, "A", false),
                window(2, "Minimised", true),
                window(3, "C", false),
            ],
        );

        assert_eq!(
            on_click(&e, Some(WindowId(1))),
            DockAction::Cycle(WindowId(3))
        );
    }

    #[test]
    fn a_partially_minimised_app_focuses_a_visible_window() {
        let e = entry(
            "chrome",
            vec![window(1, "Minimised", true), window(2, "B", false)],
        );

        assert!(!e.fully_minimized());
        assert_eq!(on_click(&e, None), DockAction::Focus(WindowId(2)));
    }

    #[test]
    fn an_unpinned_entry_with_no_app_cannot_be_launched() {
        let e = DockEntry {
            app: None,
            display_name: "Unknown".into(),
            pinned: false,
            windows: Vec::new(),
            active: false,
        };

        assert_eq!(on_click(&e, None), DockAction::Nothing);
    }

    #[test]
    fn minimised_counts_are_reported_separately_from_the_total() {
        let e = entry(
            "chrome",
            vec![
                window(1, "A", true),
                window(2, "B", false),
                window(3, "C", true),
            ],
        );

        assert_eq!(e.window_count(), 3);
        assert_eq!(e.minimized_count(), 2);
        assert!(!e.fully_minimized());
    }
}
