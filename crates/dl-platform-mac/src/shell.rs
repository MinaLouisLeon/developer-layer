//! macOS shell integration, deferred to phase 10.
//!
//! The mapping is not one-to-one with Windows. Moving another application's
//! windows requires `AXUIElement` and the Accessibility permission the user
//! must grant explicitly; there is no `SHAppBarMessage` equivalent for
//! reserving a screen edge; display identity comes from `CGDisplay` rather than
//! `QueryDisplayConfig`.

use dl_core::{Monitor, Rect, WindowId, WindowRecord};
use dl_platform::{DockEdge, PlatformError, Result, ShellIntegration};

#[derive(Debug, Default)]
pub struct MacShell {
    _private: (),
}

impl MacShell {
    pub fn new() -> Self {
        Self::default()
    }
}

impl ShellIntegration for MacShell {
    fn monitors(&self) -> Result<Vec<Monitor>> {
        Err(PlatformError::Unsupported(
            "monitors: implemented in phase 10",
        ))
    }

    fn windows(&self) -> Result<Vec<WindowRecord>> {
        Err(PlatformError::Unsupported(
            "windows: implemented in phase 10",
        ))
    }

    fn set_window_bounds(&self, _window: WindowId, _bounds: Rect) -> Result<()> {
        Err(PlatformError::Unsupported(
            "set_window_bounds: implemented in phase 10",
        ))
    }

    fn focus_window(&self, _window: WindowId) -> Result<()> {
        Err(PlatformError::Unsupported(
            "focus_window: implemented in phase 10",
        ))
    }

    fn minimize_window(&self, _window: WindowId) -> Result<()> {
        Err(PlatformError::Unsupported(
            "minimize_window: implemented in phase 10",
        ))
    }

    fn restore_window(&self, _window: WindowId) -> Result<()> {
        Err(PlatformError::Unsupported(
            "restore_window: implemented in phase 10",
        ))
    }

    fn suppress_maximize(&self, _window: WindowId) -> Result<()> {
        Err(PlatformError::Unsupported(
            "suppress_maximize: implemented in phase 10",
        ))
    }

    fn reserve_dock_space(&self, _edge: DockEdge, _thickness: i32) -> Result<()> {
        Err(PlatformError::Unsupported(
            "reserve_dock_space: macOS has no AppBar equivalent",
        ))
    }

    fn release_dock_space(&self) -> Result<()> {
        Err(PlatformError::Unsupported(
            "release_dock_space: macOS has no AppBar equivalent",
        ))
    }

    fn set_native_taskbar_visible(&self, _visible: bool) -> Result<()> {
        Err(PlatformError::Unsupported(
            "set_native_taskbar_visible: implemented in phase 10",
        ))
    }
}
