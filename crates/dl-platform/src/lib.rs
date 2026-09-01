//! Platform abstraction.
//!
//! This crate declares *what* the shell needs from an operating system and
//! contains no OS calls of its own. `dl-platform-win` implements it with
//! `windows-rs`; `dl-platform-mac` will implement it with AppKit and the
//! Accessibility API.
//!
//! Keeping the boundary here from the start is what makes the macOS port an
//! implementation rather than a rewrite. Expect roughly 60% parity: macOS
//! window management requires Accessibility permissions and has no AppBar
//! equivalent.

use dl_core::{Monitor, Rect, WindowId, WindowRecord};

#[derive(Debug, thiserror::Error)]
pub enum PlatformError {
    #[error("window {0:?} no longer exists")]
    WindowGone(WindowId),
    #[error("access denied for window {0:?} — the owning process is likely elevated")]
    AccessDenied(WindowId),
    #[error("display enumeration failed: {0}")]
    DisplayEnumeration(String),
    #[error("shell integration failed: {0}")]
    Shell(String),
    #[error("not supported on this platform: {0}")]
    Unsupported(&'static str),
}

pub type Result<T> = std::result::Result<T, PlatformError>;

/// Where the dock reserves space, mapped to `ABE_*` on Windows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DockEdge {
    Left,
    Top,
    Right,
    Bottom,
}

/// Everything the shell needs from the host operating system.
pub trait ShellIntegration: Send + Sync {
    /// Enumerate connected displays with stable, EDID-derived identities.
    fn monitors(&self) -> Result<Vec<Monitor>>;

    /// Enumerate manageable top-level windows.
    ///
    /// Implementations must exclude cloaked windows. Windows 11 keeps cloaked
    /// ghost windows around for suspended UWP apps, and including them fills
    /// the dock with phantom entries.
    fn windows(&self) -> Result<Vec<WindowRecord>>;

    /// Move and resize a window without activating it.
    ///
    /// Implementations must compensate for the invisible resize border:
    /// `GetWindowRect` on Windows 10 and 11 reports bounds roughly 7px larger
    /// than the visible frame, so tiling to raw values produces uneven gaps and
    /// apparently overlapping windows. Compare against the DWM extended frame
    /// bounds and correct per window.
    fn set_window_bounds(&self, window: WindowId, bounds: Rect) -> Result<()>;

    fn focus_window(&self, window: WindowId) -> Result<()>;
    fn minimize_window(&self, window: WindowId) -> Result<()>;
    fn restore_window(&self, window: WindowId) -> Result<()>;

    /// Prevent a window from maximising.
    ///
    /// Enforcement is reactive: strip the maximise affordance, then watch for
    /// the maximised state and restore. Preemptive blocking would require
    /// hooking another process's window procedure through DLL injection, which
    /// this project avoids for antivirus reasons. A single-frame flicker when
    /// an app maximises itself from saved state is expected.
    fn suppress_maximize(&self, window: WindowId) -> Result<()>;

    /// Reserve screen space for the dock so maximised windows do not cover it.
    fn reserve_dock_space(&self, edge: DockEdge, thickness: i32) -> Result<()>;
    fn release_dock_space(&self) -> Result<()>;

    /// Hide the native taskbar.
    ///
    /// The caller is responsible for guaranteeing restoration — a crash while
    /// the taskbar is hidden leaves the user with no shell at all.
    fn set_native_taskbar_visible(&self, visible: bool) -> Result<()>;
}

/// A no-op implementation used by tests and by unsupported platforms, so the
/// rest of the workspace builds and runs anywhere.
#[derive(Debug, Default, Clone, Copy)]
pub struct NullShell;

impl ShellIntegration for NullShell {
    fn monitors(&self) -> Result<Vec<Monitor>> {
        Ok(Vec::new())
    }
    fn windows(&self) -> Result<Vec<WindowRecord>> {
        Ok(Vec::new())
    }
    fn set_window_bounds(&self, _window: WindowId, _bounds: Rect) -> Result<()> {
        Ok(())
    }
    fn focus_window(&self, _window: WindowId) -> Result<()> {
        Ok(())
    }
    fn minimize_window(&self, _window: WindowId) -> Result<()> {
        Ok(())
    }
    fn restore_window(&self, _window: WindowId) -> Result<()> {
        Ok(())
    }
    fn suppress_maximize(&self, _window: WindowId) -> Result<()> {
        Ok(())
    }
    fn reserve_dock_space(&self, _edge: DockEdge, _thickness: i32) -> Result<()> {
        Ok(())
    }
    fn release_dock_space(&self) -> Result<()> {
        Ok(())
    }
    fn set_native_taskbar_visible(&self, _visible: bool) -> Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn null_shell_satisfies_the_trait_object() {
        let shell: Box<dyn ShellIntegration> = Box::new(NullShell);
        assert!(shell.monitors().expect("monitors").is_empty());
        assert!(shell.windows().expect("windows").is_empty());
    }
}
