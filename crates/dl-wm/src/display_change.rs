//! Display connect and disconnect handling.
//!
//! Encodes the rule set decided during design:
//!
//! 1. The display set changes; look up the saved layout for the new set.
//! 2. No layout saved — fall back to the designated default.
//! 3. Windows whose slot no longer exists **minimise to the dock**, never
//!    force-placed into the surviving layout. Cramming windows from a lost
//!    monitor into the remaining one would wreck a deliberately built
//!    arrangement, and force-placement is how windows end up stranded offscreen.
//! 4. Remaining tiles resize elastically to fill.
//! 5. The telemetry tile is the sole exception: it migrates rather than
//!    minimising, because it is defined as always-open.
//! 6. On reconnect, every window the *disconnect* minimised is restored —
//!    and only those.

use dl_core::{MinimizeReason, Monitor, MonitorId, SlotLayout, WindowId, WindowRecord};

use crate::resolve::{Placement, Resolver};

/// What happened to the set of connected displays.
#[derive(Debug, Clone, PartialEq)]
pub struct DisplayChange {
    pub monitors: Vec<Monitor>,
}

/// What a window should do in response.
#[derive(Debug, Clone, PartialEq)]
pub enum WindowAction {
    /// Move to these bounds.
    Place(Placement),
    /// Minimise to the dock, tagged so reconnect can distinguish it from a
    /// minimise the user performed themselves.
    Minimize {
        window: WindowId,
        reason: MinimizeReason,
    },
    /// Restore from the dock; the following resolve pass positions it.
    Restore { window: WindowId },
}

#[derive(Debug, Clone, PartialEq)]
pub struct DisplayChangeOutcome {
    pub actions: Vec<WindowAction>,
    /// Where the telemetry tile should live now. It never minimises.
    pub telemetry_monitor: Option<MonitorId>,
}

/// Apply a display change against a layout and the current window set.
pub fn apply(
    change: &DisplayChange,
    layout: &SlotLayout,
    windows: &[WindowRecord],
    telemetry_preference: Option<&MonitorId>,
) -> DisplayChangeOutcome {
    let mut actions = Vec::new();

    // Step 6 first: anything the previous disconnect parked comes back, so it
    // is eligible for placement in this pass. A window the user minimised
    // themselves is left alone.
    let mut candidates: Vec<WindowRecord> = Vec::with_capacity(windows.len());
    for window in windows {
        if window.should_restore_on_reconnect() {
            actions.push(WindowAction::Restore { window: window.id });
            let mut restored = window.clone();
            restored.minimized = None;
            candidates.push(restored);
        } else {
            candidates.push(window.clone());
        }
    }

    let resolver = Resolver::new(layout, &change.monitors);

    for placement in resolver.resolve(&candidates) {
        actions.push(WindowAction::Place(placement));
    }

    // Step 3: no slot available means the dock, tagged as disconnect-orphaned.
    for window in resolver.unplaceable(&candidates) {
        actions.push(WindowAction::Minimize {
            window,
            reason: MinimizeReason::DisplayDisconnect,
        });
    }

    DisplayChangeOutcome {
        actions,
        telemetry_monitor: resolve_telemetry_monitor(&change.monitors, telemetry_preference),
    }
}

/// The telemetry tile lives on its nominated monitor when that monitor is
/// present, and migrates to primary when it is not. It never minimises.
fn resolve_telemetry_monitor(
    monitors: &[Monitor],
    preference: Option<&MonitorId>,
) -> Option<MonitorId> {
    if let Some(preferred) = preference {
        if monitors.iter().any(|m| &m.id == preferred) {
            return Some(preferred.clone());
        }
    }

    monitors
        .iter()
        .find(|m| m.is_primary)
        .or_else(|| monitors.first())
        .map(|m| m.id.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use dl_core::{AppId, DisplaySet, NormalizedRect, Rect, Slot, SlotId, TileMode, WindowRecord};

    fn mon(id: &str, primary: bool) -> Monitor {
        Monitor {
            id: MonitorId::new(id),
            name: id.into(),
            bounds: Rect::new(0, 0, 1000, 1000),
            work_area: Rect::new(0, 0, 1000, 1000),
            scale_factor: 1.0,
            is_primary: primary,
        }
    }

    fn slot(id: &str, monitor: &str, app: &str, bounds: NormalizedRect) -> Slot {
        Slot {
            id: SlotId::new(id),
            monitor: MonitorId::new(monitor),
            bounds,
            assigned_app: Some(AppId::new(app)),
            is_telemetry: false,
        }
    }

    fn window(id: u64, app: &str, minimized: Option<MinimizeReason>) -> WindowRecord {
        WindowRecord {
            id: WindowId(id),
            app_id: Some(AppId::new(app)),
            title: app.into(),
            monitor: None,
            slot: None,
            tile_mode: TileMode::Tiled,
            minimized,
        }
    }

    /// Single-monitor layout with room for VS Code only.
    fn undocked_layout() -> SlotLayout {
        let mut l = SlotLayout::new(
            DisplaySet::new(vec![MonitorId::new("laptop")]),
            "Undocked",
            vec![slot("main", "laptop", "vscode", NormalizedRect::FULL)],
        );
        l.gap = 0;
        l
    }

    #[test]
    fn orphaned_windows_minimize_rather_than_being_forced_into_the_survivor() {
        let change = DisplayChange {
            monitors: vec![mon("laptop", true)],
        };
        let windows = vec![window(1, "vscode", None), window(2, "slack", None)];

        let outcome = apply(&change, &undocked_layout(), &windows, None);

        // VS Code keeps its slot; Slack goes to the dock tagged as an orphan.
        assert!(outcome.actions.iter().any(|a| matches!(
            a,
            WindowAction::Place(p) if p.window == WindowId(1)
        )));
        assert!(outcome.actions.contains(&WindowAction::Minimize {
            window: WindowId(2),
            reason: MinimizeReason::DisplayDisconnect,
        }));
    }

    #[test]
    fn reconnect_restores_disconnect_orphans_but_not_user_minimized_windows() {
        let mut docked = SlotLayout::new(
            DisplaySet::new(vec![MonitorId::new("laptop"), MonitorId::new("dell")]),
            "Docked",
            vec![
                slot("main", "laptop", "vscode", NormalizedRect::FULL),
                slot("side", "dell", "slack", NormalizedRect::FULL),
            ],
        );
        docked.gap = 0;

        let change = DisplayChange {
            monitors: vec![mon("laptop", true), mon("dell", false)],
        };

        let windows = vec![
            window(1, "vscode", None),
            // Parked by an earlier disconnect — should come back.
            window(2, "slack", Some(MinimizeReason::DisplayDisconnect)),
            // Minimised deliberately before undocking — must stay down.
            window(3, "postman", Some(MinimizeReason::User)),
        ];

        let outcome = apply(&change, &docked, &windows, None);

        assert!(outcome.actions.contains(&WindowAction::Restore {
            window: WindowId(2)
        }));
        assert!(
            !outcome.actions.contains(&WindowAction::Restore {
                window: WindowId(3)
            }),
            "a window the user minimised must not be resurrected by docking"
        );
    }

    #[test]
    fn surviving_tiles_expand_to_fill_the_vacated_space() {
        let change = DisplayChange {
            monitors: vec![mon("laptop", true)],
        };
        let windows = vec![window(1, "vscode", None)];

        let outcome = apply(&change, &undocked_layout(), &windows, None);

        let placed: Vec<&Placement> = outcome
            .actions
            .iter()
            .filter_map(|a| match a {
                WindowAction::Place(p) => Some(p),
                _ => None,
            })
            .collect();

        assert_eq!(placed.len(), 1);
        assert_eq!(placed[0].bounds, Rect::new(0, 0, 1000, 1000));
    }

    #[test]
    fn telemetry_migrates_to_primary_when_its_monitor_disconnects() {
        let preferred = MonitorId::new("benq");
        let change = DisplayChange {
            monitors: vec![mon("laptop", true), mon("dell", false)],
        };

        let outcome = apply(&change, &undocked_layout(), &[], Some(&preferred));

        assert_eq!(
            outcome.telemetry_monitor,
            Some(MonitorId::new("laptop")),
            "telemetry never minimises — it moves to primary"
        );
    }

    #[test]
    fn telemetry_returns_to_its_nominated_monitor_on_reconnect() {
        let preferred = MonitorId::new("benq");
        let change = DisplayChange {
            monitors: vec![mon("laptop", true), mon("benq", false)],
        };

        let outcome = apply(&change, &undocked_layout(), &[], Some(&preferred));

        assert_eq!(outcome.telemetry_monitor, Some(preferred));
    }

    #[test]
    fn telemetry_falls_back_to_the_only_display_when_none_is_primary() {
        let change = DisplayChange {
            monitors: vec![mon("laptop", false)],
        };

        let outcome = apply(&change, &undocked_layout(), &[], None);

        assert_eq!(outcome.telemetry_monitor, Some(MonitorId::new("laptop")));
    }
}
