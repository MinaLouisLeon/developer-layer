//! Phase 01 implements this against `windows-rs`. The type exists now so the
//! wiring in `apps/desktop` is real rather than hypothetical.

use dl_core::{Monitor, Rect, WindowId, WindowRecord};
use dl_platform::{DockEdge, PlatformError, Result, ShellIntegration};

#[derive(Debug, Default)]
pub struct WindowsShell {
    _private: (),
}

impl WindowsShell {
    pub fn new() -> Self {
        Self::default()
    }
}

impl ShellIntegration for WindowsShell {
    fn monitors(&self) -> Result<Vec<Monitor>> {
        // Phase 01: QueryDisplayConfig for EDID-derived identity, then
        // EnumDisplayMonitors for bounds and per-monitor DPI.
        Err(PlatformError::Unsupported(
            "monitors: implemented in phase 01",
        ))
    }

    fn windows(&self) -> Result<Vec<WindowRecord>> {
        // Phase 01: EnumWindows, excluding tool windows and — critically —
        // anything reporting DWMWA_CLOAKED.
        Err(PlatformError::Unsupported(
            "windows: implemented in phase 01",
        ))
    }

    fn set_window_bounds(&self, _window: WindowId, _bounds: Rect) -> Result<()> {
        Err(PlatformError::Unsupported(
            "set_window_bounds: implemented in phase 01",
        ))
    }

    fn focus_window(&self, _window: WindowId) -> Result<()> {
        Err(PlatformError::Unsupported(
            "focus_window: implemented in phase 01",
        ))
    }

    fn minimize_window(&self, _window: WindowId) -> Result<()> {
        Err(PlatformError::Unsupported(
            "minimize_window: implemented in phase 01",
        ))
    }

    fn restore_window(&self, _window: WindowId) -> Result<()> {
        Err(PlatformError::Unsupported(
            "restore_window: implemented in phase 01",
        ))
    }

    fn suppress_maximize(&self, _window: WindowId) -> Result<()> {
        Err(PlatformError::Unsupported(
            "suppress_maximize: implemented in phase 01",
        ))
    }

    fn reserve_dock_space(&self, _edge: DockEdge, _thickness: i32) -> Result<()> {
        Err(PlatformError::Unsupported(
            "reserve_dock_space: implemented in phase 05",
        ))
    }

    fn release_dock_space(&self) -> Result<()> {
        Err(PlatformError::Unsupported(
            "release_dock_space: implemented in phase 05",
        ))
    }

    fn set_native_taskbar_visible(&self, _visible: bool) -> Result<()> {
        Err(PlatformError::Unsupported(
            "set_native_taskbar_visible: implemented in phase 05",
        ))
    }
}
