//! The `ShellIntegration` implementation for Windows.

use dl_core::{Monitor, Rect, WindowAttributes, WindowId};
use dl_platform::{DockEdge, PlatformError, Result, ShellIntegration};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, IsWindow, SetForegroundWindow, SetWindowLongPtrW, SetWindowPos, ShowWindow,
    GWL_STYLE, HWND_TOP, SWP_ASYNCWINDOWPOS, SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_NOZORDER,
    SW_MINIMIZE, SW_RESTORE, WS_MAXIMIZEBOX,
};

use crate::error::last_error;
use crate::{monitors, taskbar, windows_enum};
use dl_wm::taskbar_guard::{RestoreReason, TaskbarState};
use std::sync::Mutex;

#[derive(Debug, Default)]
pub struct WindowsShell {
    /// Shared with the panic hook and exception filter so every restore route
    /// agrees on whether the taskbar is currently hidden.
    taskbar: TaskbarState,
    /// The dock window that owns the AppBar reservation. Set once the dock
    /// exists; until then there is nothing to reserve space for.
    dock_hwnd: Mutex<Option<isize>>,
}

impl WindowsShell {
    pub fn new() -> Self {
        let shell = Self::default();
        // Installed before anything can hide the taskbar, so a crash during
        // startup still restores it.
        taskbar::install_crash_handlers(shell.taskbar.clone());
        shell
    }

    /// Shared taskbar state, for the guardian process and the restore hotkey.
    pub fn taskbar_state(&self) -> TaskbarState {
        self.taskbar.clone()
    }

    /// Register which window owns the AppBar reservation.
    pub fn set_dock_window(&self, hwnd: isize) {
        if let Ok(mut slot) = self.dock_hwnd.lock() {
            *slot = Some(hwnd);
        }
    }

    fn dock_window(&self) -> Result<HWND> {
        self.dock_hwnd
            .lock()
            .ok()
            .and_then(|slot| *slot)
            .map(|raw| HWND(raw as *mut core::ffi::c_void))
            .ok_or_else(|| PlatformError::Shell("no dock window registered".into()))
    }
}

/// Convert our opaque id back into an `HWND`, rejecting handles that have since
/// been destroyed. Windows recycles handle values, but `IsWindow` plus the
/// short interval between enumeration and use makes this safe in practice.
fn handle(window: WindowId) -> Result<HWND> {
    let hwnd = HWND(window.0 as *mut core::ffi::c_void);
    // SAFETY: IsWindow tolerates arbitrary handle values by design.
    if unsafe { IsWindow(Some(hwnd)) }.as_bool() {
        Ok(hwnd)
    } else {
        Err(PlatformError::WindowGone(window))
    }
}

impl ShellIntegration for WindowsShell {
    fn monitors(&self) -> Result<Vec<Monitor>> {
        monitors::enumerate()
    }

    fn windows(&self) -> Result<Vec<WindowAttributes>> {
        windows_enum::enumerate()
    }

    fn set_window_bounds(&self, window: WindowId, outer: Rect) -> Result<()> {
        let hwnd = handle(window)?;

        // NOACTIVATE and NOZORDER keep focus and stacking where the user left
        // them — a tiling pass must never steal focus. ASYNCWINDOWPOS avoids
        // blocking our message loop on an application that is busy or hung.
        //
        // `outer` is already invisible-border compensated by dl-wm; adjusting
        // it again here would double-apply the correction.
        // SAFETY: hwnd validated above.
        unsafe {
            SetWindowPos(
                hwnd,
                Some(HWND_TOP),
                outer.x,
                outer.y,
                outer.width,
                outer.height,
                SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOOWNERZORDER | SWP_ASYNCWINDOWPOS,
            )
        }
        .map_err(|e| last_error("SetWindowPos", e))
    }

    fn focus_window(&self, window: WindowId) -> Result<()> {
        let hwnd = handle(window)?;
        // SAFETY: hwnd validated above.
        let ok = unsafe { SetForegroundWindow(hwnd) }.as_bool();
        if ok {
            Ok(())
        } else {
            // SetForegroundWindow refuses when the caller does not own the
            // foreground. Reporting it is more useful than pretending.
            Err(PlatformError::AccessDenied(window))
        }
    }

    fn minimize_window(&self, window: WindowId) -> Result<()> {
        let hwnd = handle(window)?;
        // SAFETY: hwnd validated above. ShowWindow returns the previous state
        // rather than success, so the BOOL is not an error signal.
        let _ = unsafe { ShowWindow(hwnd, SW_MINIMIZE) };
        Ok(())
    }

    fn restore_window(&self, window: WindowId) -> Result<()> {
        let hwnd = handle(window)?;
        // SAFETY: as above.
        let _ = unsafe { ShowWindow(hwnd, SW_RESTORE) };
        Ok(())
    }

    fn suppress_maximize(&self, window: WindowId) -> Result<()> {
        let hwnd = handle(window)?;

        // Stripping WS_MAXIMIZEBOX removes the button and the double-click and
        // Win+Up routes. It does not stop an application maximising itself
        // programmatically — that is caught reactively by the reconcile pass,
        // which is why a single-frame flicker is expected on apps that restore
        // a maximised state at startup.
        // SAFETY: hwnd validated above.
        unsafe {
            let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
            let stripped = style & !(WS_MAXIMIZEBOX.0 as isize);
            if stripped != style {
                SetWindowLongPtrW(hwnd, GWL_STYLE, stripped);
            }
        }

        Ok(())
    }

    fn capture_window(&self, window: WindowId) -> Result<Vec<u8>> {
        crate::thumbnails::capture_window(handle(window)?)
    }

    fn reserve_dock_space(&self, edge: DockEdge, thickness: i32) -> Result<()> {
        let hwnd = self.dock_window()?;

        // Reserve on the primary display: an AppBar edge belongs to one
        // monitor, and the dock lives on one.
        let monitor = self
            .monitors()?
            .into_iter()
            .find(|m| m.is_primary)
            .ok_or_else(|| PlatformError::DisplayEnumeration("no primary display".into()))?;

        taskbar::reserve_dock_space(hwnd, edge, thickness, monitor.bounds)
    }

    fn release_dock_space(&self) -> Result<()> {
        taskbar::release_dock_space(self.dock_window()?)
    }

    fn set_native_taskbar_visible(&self, visible: bool) -> Result<()> {
        if visible {
            taskbar::restore(&self.taskbar, RestoreReason::Normal)
        } else {
            taskbar::hide(&self.taskbar)
        }
    }
}
