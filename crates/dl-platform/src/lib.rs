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
//!
//! The trait reports **facts** and performs **actions**. It never decides
//! policy — whether a window should tile, where it belongs, and whether it
//! needs moving are all `dl-wm`'s business.

use dl_core::{Monitor, Rect, WindowAttributes, WindowId};

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
    ///
    /// Implementations must not derive identity from `\\.\DISPLAY1`-style
    /// names, which Windows reassigns across reboots and replugs.
    fn monitors(&self) -> Result<Vec<Monitor>>;

    /// Observe every top-level window as raw facts.
    ///
    /// Implementations report; they do not filter on policy. The one exception
    /// is windows that are not top-level at all. Cloaked windows **must** be
    /// reported with `is_cloaked` set rather than dropped, so the classifier
    /// can distinguish "ignored because cloaked" from "no longer exists".
    fn windows(&self) -> Result<Vec<WindowAttributes>>;

    /// Move and resize a window without activating it.
    ///
    /// `outer` is the raw rect for `SetWindowPos` — the caller has already
    /// applied invisible-border compensation, so implementations must not
    /// adjust it again.
    fn set_window_bounds(&self, window: WindowId, outer: Rect) -> Result<()>;

    fn focus_window(&self, window: WindowId) -> Result<()>;
    fn minimize_window(&self, window: WindowId) -> Result<()>;
    fn restore_window(&self, window: WindowId) -> Result<()>;

    /// Remove the maximise affordance.
    ///
    /// Enforcement is reactive by design: this strips the style, and the
    /// reconcile pass catches anything that maximises itself programmatically.
    /// Blocking it preemptively would need a window-procedure hook via DLL
    /// injection, which this project avoids for antivirus reasons.
    fn suppress_maximize(&self, window: WindowId) -> Result<()>;

    /// Capture a window as PNG bytes, for a dock hover preview.
    ///
    /// Returns an error for a window with no visible area — a minimised or
    /// suspended window has nothing to capture, which is routine rather than a
    /// fault.
    fn capture_window(&self, window: WindowId) -> Result<Vec<u8>>;

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
    fn windows(&self) -> Result<Vec<WindowAttributes>> {
        Ok(Vec::new())
    }
    fn set_window_bounds(&self, _window: WindowId, _outer: Rect) -> Result<()> {
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
    fn capture_window(&self, _window: WindowId) -> Result<Vec<u8>> {
        Err(PlatformError::Unsupported(
            "capture_window: no windows to capture on this platform",
        ))
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
