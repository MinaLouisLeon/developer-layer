//! Raw observable facts about a window.
//!
//! The platform layer reports these; everything above decides what they mean.
//! Deliberately plain data with no Win32 types, so the classification rules in
//! `dl-wm` are testable on any platform. Translating `WS_*` styles and DWM
//! attributes into these booleans is `dl-platform-win`'s job.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::geometry::Rect;
use crate::window::WindowId;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct WindowAttributes {
    pub id: WindowId,
    pub title: String,
    /// Win32 window class. The cheapest reliable discriminator for shell
    /// windows and dialog-shaped windows.
    pub class_name: String,
    /// Owning process image path. `None` when the process could not be opened,
    /// which happens for elevated processes when we are not elevated.
    pub executable: Option<PathBuf>,
    /// AppUserModelID, present for packaged (MSIX) applications. This is how a
    /// Store app like WhatsApp is matched, since it has no useful exe path.
    pub aumid: Option<String>,

    /// `GetWindowRect` — includes the invisible resize border on Windows 10/11.
    pub outer_bounds: Rect,
    /// `DWMWA_EXTENDED_FRAME_BOUNDS` — the frame the user actually sees.
    /// Tiling against `outer_bounds` is what produces uneven gaps.
    pub frame_bounds: Rect,

    pub is_visible: bool,
    /// `DWMWA_CLOAKED`. Windows 11 keeps cloaked ghost windows for suspended
    /// UWP apps; treating them as real fills the dock with phantoms.
    pub is_cloaked: bool,
    /// `WS_EX_TOOLWINDOW` — palettes and helper windows, never managed.
    pub is_tool_window: bool,
    /// Has an owner window, i.e. `GetWindow(hwnd, GW_OWNER)` is non-null.
    /// Owned windows are dialogs; forcing them into the grid breaks the app.
    pub has_owner: bool,
    /// `WS_THICKFRAME`. A window without it cannot be resized, so tiling it
    /// would leave the slot half-filled.
    pub is_resizable: bool,
    pub is_minimized: bool,
    pub is_maximized: bool,
}

impl WindowAttributes {
    /// Per-side padding between the outer rect and the visible frame.
    ///
    /// On Windows 10 and 11 this is typically 0 at the top and roughly 7px on
    /// the left, right and bottom — the invisible grab border.
    pub fn frame_padding(&self) -> FramePadding {
        FramePadding {
            left: self.frame_bounds.x - self.outer_bounds.x,
            top: self.frame_bounds.y - self.outer_bounds.y,
            right: self.outer_bounds.right() - self.frame_bounds.right(),
            bottom: self.outer_bounds.bottom() - self.frame_bounds.bottom(),
        }
    }
}

/// Difference between what `GetWindowRect` reports and what the user sees.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct FramePadding {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl FramePadding {
    pub const NONE: Self = Self {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };

    pub fn is_none(&self) -> bool {
        *self == Self::NONE
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn attrs(outer: Rect, frame: Rect) -> WindowAttributes {
        WindowAttributes {
            id: WindowId(1),
            title: "Visual Studio Code".into(),
            class_name: "Chrome_WidgetWin_1".into(),
            executable: None,
            aumid: None,
            outer_bounds: outer,
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

    #[test]
    fn measures_the_invisible_resize_border() {
        // Typical Windows 11 values: no padding at the top, 7px elsewhere.
        let outer = Rect::new(-7, 0, 1934, 1047);
        let frame = Rect::new(0, 0, 1920, 1040);

        assert_eq!(
            attrs(outer, frame).frame_padding(),
            FramePadding {
                left: 7,
                top: 0,
                right: 7,
                bottom: 7,
            }
        );
    }

    #[test]
    fn reports_no_padding_for_a_borderless_window() {
        let same = Rect::new(0, 0, 800, 600);
        assert!(attrs(same, same).frame_padding().is_none());
    }
}
