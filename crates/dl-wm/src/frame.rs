//! Invisible-border compensation.
//!
//! `SetWindowPos` positions the *outer* window rect, but the user sees the DWM
//! frame, which on Windows 10 and 11 sits roughly 7px inside it on the left,
//! right and bottom. Passing slot bounds straight to `SetWindowPos` therefore
//! leaves visible gaps ~14px wider than configured between horizontal
//! neighbours, and windows that look like they overlap the screen edge.
//!
//! This is the single most common reason a hand-rolled tiling layer looks
//! subtly wrong, and it is pure arithmetic, so it is tested rather than
//! discovered on the target machine.

use dl_core::{FramePadding, Rect};

/// Convert a desired *visible frame* into the rect `SetWindowPos` must receive.
///
/// Inverse of [`visible_frame_of`].
pub fn compensate(target: Rect, padding: FramePadding) -> Rect {
    Rect {
        x: target.x - padding.left,
        y: target.y - padding.top,
        width: target.width + padding.left + padding.right,
        height: target.height + padding.top + padding.bottom,
    }
}

/// The visible frame that results from an outer rect. Inverse of [`compensate`].
pub fn visible_frame_of(outer: Rect, padding: FramePadding) -> Rect {
    Rect {
        x: outer.x + padding.left,
        y: outer.y + padding.top,
        width: outer.width - padding.left - padding.right,
        height: outer.height - padding.top - padding.bottom,
    }
}

/// Whether two rects agree within `tolerance` on every edge.
///
/// Applications are not obliged to honour an exact size. Terminals snap to
/// character cells, some apps enforce minimum dimensions, and a few round to
/// even pixels. Comparing exactly would make reconcile re-issue `SetWindowPos`
/// forever against a window that will never match, repainting on every pass.
pub fn approximately_equal(a: Rect, b: Rect, tolerance: i32) -> bool {
    (a.x - b.x).abs() <= tolerance
        && (a.y - b.y).abs() <= tolerance
        && (a.width - b.width).abs() <= tolerance
        && (a.height - b.height).abs() <= tolerance
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Typical Windows 11 padding: nothing at the top, 7px elsewhere.
    const WIN11: FramePadding = FramePadding {
        left: 7,
        top: 0,
        right: 7,
        bottom: 7,
    };

    #[test]
    fn compensation_makes_the_visible_frame_land_on_the_slot() {
        let slot = Rect::new(0, 0, 960, 1040);

        let outer = compensate(slot, WIN11);

        assert_eq!(outer, Rect::new(-7, 0, 974, 1047));
        assert_eq!(
            visible_frame_of(outer, WIN11),
            slot,
            "round-tripping must return the slot exactly"
        );
    }

    #[test]
    fn without_compensation_neighbours_appear_to_overlap() {
        // Two side-by-side slots with no gap, positioned naively.
        let left = Rect::new(0, 0, 960, 1000);
        let right = Rect::new(960, 0, 960, 1000);

        let naive_left_visible = visible_frame_of(left, WIN11);
        let naive_right_visible = visible_frame_of(right, WIN11);

        // What the user actually sees is a 14px trench between them.
        let seen_gap = naive_right_visible.x - naive_left_visible.right();
        assert_eq!(seen_gap, 14);

        // Compensated, the visible frames touch exactly as configured.
        let fixed_left = visible_frame_of(compensate(left, WIN11), WIN11);
        let fixed_right = visible_frame_of(compensate(right, WIN11), WIN11);
        assert_eq!(fixed_right.x - fixed_left.right(), 0);
    }

    #[test]
    fn zero_padding_is_a_no_op() {
        let slot = Rect::new(100, 50, 800, 600);
        assert_eq!(compensate(slot, FramePadding::NONE), slot);
    }

    #[test]
    fn compensation_works_at_negative_coordinates() {
        // A monitor to the left of primary sits at negative x.
        let slot = Rect::new(-1920, 0, 960, 1040);

        assert_eq!(
            visible_frame_of(compensate(slot, WIN11), WIN11),
            slot,
            "secondary monitors must not be a special case"
        );
    }

    #[test]
    fn tolerance_absorbs_an_app_snapping_to_its_own_grid() {
        let requested = Rect::new(0, 0, 960, 1040);
        // A terminal rounding down to whole character cells.
        let actual = Rect::new(0, 0, 954, 1036);

        assert!(approximately_equal(requested, actual, 8));
        assert!(!approximately_equal(requested, actual, 2));
    }

    #[test]
    fn tolerance_does_not_hide_a_real_mismatch() {
        let requested = Rect::new(0, 0, 960, 1040);
        let wrong_slot = Rect::new(960, 0, 960, 1040);

        assert!(!approximately_equal(requested, wrong_slot, 8));
    }
}
