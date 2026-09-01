//! Turning desired state into the minimum set of platform calls.
//!
//! The engine runs on every window event, and window events are frequent —
//! `EVENT_OBJECT_LOCATIONCHANGE` alone fires continuously while a window is
//! being dragged. Re-issuing `SetWindowPos` for every window on every pass
//! would repaint constantly and fight the user mid-drag.
//!
//! So reconcile emits an operation only where observed state actually differs
//! from desired state, within a tolerance that absorbs applications snapping to
//! their own size increments.

use std::collections::HashMap;

use dl_core::{Rect, TileMode, WindowAttributes, WindowId};

use crate::frame::{approximately_equal, compensate};
use crate::resolve::Placement;

/// Default slack when comparing observed geometry against desired geometry.
///
/// Large enough for a terminal rounding to character cells, small enough that a
/// window in the wrong slot is still detected.
pub const DEFAULT_TOLERANCE: i32 = 8;

/// A single call for the platform layer to make.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Operation {
    /// `SetWindowPos` with the outer rect, already frame-compensated.
    SetBounds { window: WindowId, outer: Rect },
    /// Restore before positioning: a maximised window ignores `SetWindowPos`
    /// sizing until it leaves the maximised state.
    Restore { window: WindowId },
    /// Strip `WS_MAXIMIZEBOX` so the affordance disappears. Enforcement is
    /// still reactive — an app can maximise itself programmatically — but this
    /// removes the obvious route.
    SuppressMaximize { window: WindowId },
}

impl Operation {
    pub fn window(&self) -> WindowId {
        match self {
            Self::SetBounds { window, .. }
            | Self::Restore { window }
            | Self::SuppressMaximize { window } => *window,
        }
    }
}

/// Compute the operations needed to bring observed windows to desired state.
///
/// `observed` is what the platform reported this pass; `placements` is what the
/// resolver decided. Windows absent from `placements` are left alone — floating
/// windows and dock-minimised ones are handled elsewhere.
pub fn reconcile(
    placements: &[Placement],
    observed: &[WindowAttributes],
    modes: &HashMap<WindowId, TileMode>,
    tolerance: i32,
) -> Vec<Operation> {
    let by_id: HashMap<WindowId, &WindowAttributes> = observed.iter().map(|w| (w.id, w)).collect();

    let mut ops = Vec::new();

    for placement in placements {
        let Some(window) = by_id.get(&placement.window) else {
            // Reported gone between resolve and reconcile. Skipping is correct:
            // the next pass re-resolves without it.
            continue;
        };

        // A fullscreen window is deliberately exempt — the escape hatch exists
        // so screen sharing and video actually work.
        if modes.get(&placement.window) == Some(&TileMode::Fullscreen) {
            continue;
        }

        // A minimised window keeps its slot reserved but must not be moved;
        // positioning it would restore it behind the user's back.
        if window.is_minimized {
            continue;
        }

        if window.is_maximized {
            // Order matters: restoring after positioning would discard the
            // position, since the restore returns the window to its pre-maximise
            // geometry.
            ops.push(Operation::Restore {
                window: placement.window,
            });
            ops.push(Operation::SuppressMaximize {
                window: placement.window,
            });
            ops.push(Operation::SetBounds {
                window: placement.window,
                outer: compensate(placement.bounds, window.frame_padding()),
            });
            continue;
        }

        if !approximately_equal(window.frame_bounds, placement.bounds, tolerance) {
            ops.push(Operation::SetBounds {
                window: placement.window,
                outer: compensate(placement.bounds, window.frame_padding()),
            });
        }
    }

    ops
}

#[cfg(test)]
mod tests {
    use super::*;
    use dl_core::SlotId;

    const PADDED: (i32, i32, i32, i32) = (7, 0, 7, 7);

    fn observed(id: u64, frame: Rect) -> WindowAttributes {
        let (l, t, r, b) = PADDED;
        WindowAttributes {
            id: WindowId(id),
            title: "app".into(),
            class_name: "Chrome_WidgetWin_1".into(),
            executable: None,
            aumid: None,
            outer_bounds: Rect::new(
                frame.x - l,
                frame.y - t,
                frame.width + l + r,
                frame.height + t + b,
            ),
            frame_bounds: frame,
            is_visible: true,
            is_cloaked: false,
            is_tool_window: false,
            has_owner: false,
            is_resizable: true,
            is_minimized: false,
            is_maximized: false,
        }
    }

    fn placement(id: u64, bounds: Rect) -> Placement {
        Placement {
            window: WindowId(id),
            slot: SlotId::new("slot"),
            bounds,
        }
    }

    #[test]
    fn a_window_already_in_place_produces_no_work() {
        let target = Rect::new(0, 0, 960, 1040);
        let ops = reconcile(
            &[placement(1, target)],
            &[observed(1, target)],
            &HashMap::new(),
            DEFAULT_TOLERANCE,
        );

        assert!(
            ops.is_empty(),
            "re-issuing SetWindowPos every pass repaints constantly and fights the user"
        );
    }

    #[test]
    fn a_misplaced_window_is_moved_with_frame_compensation() {
        let target = Rect::new(960, 0, 960, 1040);
        let ops = reconcile(
            &[placement(1, target)],
            &[observed(1, Rect::new(0, 0, 960, 1040))],
            &HashMap::new(),
            DEFAULT_TOLERANCE,
        );

        assert_eq!(
            ops,
            vec![Operation::SetBounds {
                window: WindowId(1),
                // Compensated outwards so the visible frame lands on the slot.
                outer: Rect::new(953, 0, 974, 1047),
            }]
        );
    }

    #[test]
    fn small_deviations_within_tolerance_are_left_alone() {
        // A terminal snapping to character cells must not cause a fight.
        let target = Rect::new(0, 0, 960, 1040);
        let ops = reconcile(
            &[placement(1, target)],
            &[observed(1, Rect::new(0, 0, 954, 1036))],
            &HashMap::new(),
            DEFAULT_TOLERANCE,
        );

        assert!(ops.is_empty());
    }

    #[test]
    fn a_maximized_window_is_restored_before_being_positioned() {
        let target = Rect::new(0, 0, 960, 1040);
        let mut w = observed(1, Rect::new(0, 0, 1920, 1040));
        w.is_maximized = true;

        let ops = reconcile(
            &[placement(1, target)],
            &[w],
            &HashMap::new(),
            DEFAULT_TOLERANCE,
        );

        // Restore must precede SetBounds: restoring afterwards would throw the
        // new position away and snap back to pre-maximise geometry.
        assert_eq!(
            ops[0],
            Operation::Restore {
                window: WindowId(1)
            }
        );
        assert_eq!(
            ops[1],
            Operation::SuppressMaximize {
                window: WindowId(1)
            }
        );
        assert!(matches!(ops[2], Operation::SetBounds { .. }));
    }

    #[test]
    fn fullscreen_windows_are_exempt() {
        // The escape hatch: a Slack huddle screen-share needs real fullscreen.
        let target = Rect::new(0, 0, 960, 1040);
        let modes = HashMap::from([(WindowId(1), TileMode::Fullscreen)]);

        let ops = reconcile(
            &[placement(1, target)],
            &[observed(1, Rect::new(0, 0, 1920, 1080))],
            &modes,
            DEFAULT_TOLERANCE,
        );

        assert!(ops.is_empty());
    }

    #[test]
    fn minimized_windows_are_not_repositioned() {
        // Positioning a minimised window restores it behind the user's back.
        let target = Rect::new(0, 0, 960, 1040);
        let mut w = observed(1, Rect::new(-32000, -32000, 160, 28));
        w.is_minimized = true;

        let ops = reconcile(
            &[placement(1, target)],
            &[w],
            &HashMap::new(),
            DEFAULT_TOLERANCE,
        );

        assert!(ops.is_empty());
    }

    #[test]
    fn a_window_that_vanished_between_passes_is_skipped() {
        let ops = reconcile(
            &[placement(99, Rect::new(0, 0, 960, 1040))],
            &[],
            &HashMap::new(),
            DEFAULT_TOLERANCE,
        );

        assert!(ops.is_empty(), "a closed window must not panic the pass");
    }

    #[test]
    fn every_operation_names_its_window() {
        let mut w = observed(1, Rect::new(0, 0, 1920, 1040));
        w.is_maximized = true;

        let ops = reconcile(
            &[placement(1, Rect::new(0, 0, 960, 1040))],
            &[w],
            &HashMap::new(),
            DEFAULT_TOLERANCE,
        );

        assert!(ops.iter().all(|op| op.window() == WindowId(1)));
    }
}
