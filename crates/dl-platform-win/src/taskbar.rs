//! Native taskbar hiding, AppBar reservation, and the restore routes.
//!
//! Every function that hides anything is paired with one that puts it back, and
//! the put-back path is installed *first*. See `dl_wm::taskbar_guard` for why
//! there are four independent recovery routes rather than one.

use dl_core::Rect;
use dl_platform::{DockEdge, PlatformError, Result};
use dl_wm::taskbar_guard::{RestoreReason, TaskbarState};
use windows::core::PCWSTR;
use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::Win32::UI::Shell::{
    SHAppBarMessage, ABE_BOTTOM, ABE_LEFT, ABE_RIGHT, ABE_TOP, ABM_NEW, ABM_QUERYPOS, ABM_REMOVE,
    ABM_SETPOS, APPBARDATA,
};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowExW, FindWindowW, ShowWindow, SW_HIDE, SW_SHOWNA,
};

use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::Diagnostics::Debug::{
    SetUnhandledExceptionFilter, EXCEPTION_CONTINUE_SEARCH, EXCEPTION_POINTERS,
};
use windows::Win32::System::Threading::{
    OpenProcess, WaitForSingleObject, INFINITE, PROCESS_SYNCHRONIZE,
};

/// The primary taskbar's window class.
const TRAY_CLASS: &str = "Shell_TrayWnd";
/// Secondary taskbars — one per additional display, when the user has them
/// enabled. Missing these leaves a taskbar on every monitor but the first.
const SECONDARY_TRAY_CLASS: &str = "Shell_SecondaryTrayWnd";

/// A private message id for AppBar notifications. Any value above `WM_USER`
/// works; ours is arbitrary but must not collide with the host window's own.
const APPBAR_CALLBACK: u32 = 0x0400 + 0x7A1;

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Show or hide every native taskbar.
///
/// Returns the number of taskbar windows acted on, so the caller can tell
/// "nothing to do" from "the shell refused" — a silent zero after asking to
/// hide would otherwise look like success.
fn set_trays_visible(visible: bool) -> Result<usize> {
    let command = if visible { SW_SHOWNA } else { SW_HIDE };
    let mut acted = 0usize;

    let primary_class = wide(TRAY_CLASS);
    // SAFETY: `primary_class` is null-terminated and outlives the call.
    let primary = unsafe { FindWindowW(PCWSTR(primary_class.as_ptr()), PCWSTR::null()) };

    if let Ok(hwnd) = primary {
        if !hwnd.is_invalid() {
            // SAFETY: hwnd came from FindWindowW.
            let _ = unsafe { ShowWindow(hwnd, command) };
            acted += 1;
        }
    }

    // Secondary taskbars are siblings, so walk them rather than assuming one.
    let secondary_class = wide(SECONDARY_TRAY_CLASS);
    let mut previous: Option<HWND> = None;

    loop {
        // SAFETY: `secondary_class` outlives the call; FindWindowExW returns an
        // error once the list is exhausted.
        let next = unsafe {
            FindWindowExW(
                None,
                previous,
                PCWSTR(secondary_class.as_ptr()),
                PCWSTR::null(),
            )
        };

        let Ok(hwnd) = next else { break };
        if hwnd.is_invalid() {
            break;
        }

        // SAFETY: hwnd came from FindWindowExW.
        let _ = unsafe { ShowWindow(hwnd, command) };
        acted += 1;
        previous = Some(hwnd);
    }

    if acted == 0 && !visible {
        return Err(PlatformError::Shell(
            "no taskbar window found to hide".into(),
        ));
    }

    Ok(acted)
}

/// Hide the native taskbars, recording it so every restore route knows.
///
/// The state is marked hidden *before* the call, not after: if `ShowWindow`
/// succeeds for the primary taskbar and the process dies before the secondary,
/// a state marked afterwards would say nothing is hidden and no route would
/// clean up.
pub fn hide(state: &TaskbarState) -> Result<()> {
    state.mark_hidden();
    set_trays_visible(false).map(|_| ())
}

/// Restore the native taskbars.
///
/// Safe to call repeatedly and from any recovery route — the state check makes
/// a second call a no-op rather than a `ShowWindow` fighting the shell.
pub fn restore(state: &TaskbarState, reason: RestoreReason) -> Result<()> {
    if !state.needs_restore() {
        return Ok(());
    }

    let result = set_trays_visible(true);

    // Cleared even on failure. Leaving it set would make every later route
    // retry forever against a shell that is not cooperating, and the user's
    // escape is the hotkey, which they can press again.
    state.mark_restored();

    if reason.is_failure() {
        eprintln!("developer-layer: native taskbar restored after {reason:?}");
    }

    result.map(|_| ())
}

/// Restore without touching shared state or allocating.
///
/// Called from the unhandled-exception filter, which runs on a faulted thread
/// where the allocator may be unusable. It does the minimum: find the windows,
/// show them.
///
/// # Safety
/// Callable from a crashing context. Performs no allocation beyond two small
/// stack buffers and takes no locks.
pub unsafe fn restore_minimal() {
    let primary: [u16; 14] = [
        b'S' as u16,
        b'h' as u16,
        b'e' as u16,
        b'l' as u16,
        b'l' as u16,
        b'_' as u16,
        b'T' as u16,
        b'r' as u16,
        b'a' as u16,
        b'y' as u16,
        b'W' as u16,
        b'n' as u16,
        b'd' as u16,
        0,
    ];

    if let Ok(hwnd) = FindWindowW(PCWSTR(primary.as_ptr()), PCWSTR::null()) {
        if !hwnd.is_invalid() {
            let _ = ShowWindow(hwnd, SW_SHOWNA);
        }
    }
}

/// Reserve screen space for the dock so maximised windows do not cover it.
///
/// Registering an AppBar is a two-step negotiation: `ABM_QUERYPOS` lets the
/// shell adjust the requested rectangle around anything already reserved, and
/// `ABM_SETPOS` commits the result. Skipping the query means fighting whatever
/// else holds an edge.
pub fn reserve_dock_space(hwnd: HWND, edge: DockEdge, thickness: i32, monitor: Rect) -> Result<()> {
    let mut data = APPBARDATA {
        cbSize: std::mem::size_of::<APPBARDATA>() as u32,
        hWnd: hwnd,
        uCallbackMessage: APPBAR_CALLBACK,
        uEdge: match edge {
            DockEdge::Left => ABE_LEFT,
            DockEdge::Top => ABE_TOP,
            DockEdge::Right => ABE_RIGHT,
            DockEdge::Bottom => ABE_BOTTOM,
        },
        rc: requested_rect(edge, thickness, monitor),
        lParam: LPARAM(0),
    };

    // SAFETY: `data` is a correctly sized local for the duration of each call.
    unsafe {
        if SHAppBarMessage(ABM_NEW, &mut data) == 0 {
            return Err(PlatformError::Shell("ABM_NEW was refused".into()));
        }

        // The shell may move the rectangle to avoid an existing AppBar; take
        // what it gives back rather than insisting.
        SHAppBarMessage(ABM_QUERYPOS, &mut data);
        data.rc = clamp_to_edge(edge, thickness, monitor, data.rc);

        if SHAppBarMessage(ABM_SETPOS, &mut data) == 0 {
            SHAppBarMessage(ABM_REMOVE, &mut data);
            return Err(PlatformError::Shell("ABM_SETPOS was refused".into()));
        }
    }

    Ok(())
}

/// Release the reservation. Must run before exit, or the shell keeps the space
/// reserved for a window that no longer exists.
pub fn release_dock_space(hwnd: HWND) -> Result<()> {
    let mut data = APPBARDATA {
        cbSize: std::mem::size_of::<APPBARDATA>() as u32,
        hWnd: hwnd,
        ..Default::default()
    };

    // SAFETY: `data` is a correctly sized local.
    unsafe { SHAppBarMessage(ABM_REMOVE, &mut data) };
    Ok(())
}

fn requested_rect(edge: DockEdge, thickness: i32, monitor: Rect) -> RECT {
    match edge {
        DockEdge::Left => RECT {
            left: monitor.x,
            top: monitor.y,
            right: monitor.x + thickness,
            bottom: monitor.bottom(),
        },
        DockEdge::Right => RECT {
            left: monitor.right() - thickness,
            top: monitor.y,
            right: monitor.right(),
            bottom: monitor.bottom(),
        },
        DockEdge::Top => RECT {
            left: monitor.x,
            top: monitor.y,
            right: monitor.right(),
            bottom: monitor.y + thickness,
        },
        DockEdge::Bottom => RECT {
            left: monitor.x,
            top: monitor.bottom() - thickness,
            right: monitor.right(),
            bottom: monitor.bottom(),
        },
    }
}

/// Re-apply our thickness to whatever the shell proposed.
///
/// `ABM_QUERYPOS` can slide the bar along its edge, which is fine, but it also
/// returns a rectangle whose depth we must restore — otherwise the dock ends up
/// reserving either nothing or the whole screen.
fn clamp_to_edge(edge: DockEdge, thickness: i32, monitor: Rect, proposed: RECT) -> RECT {
    // Restore our depth on the reserved edge. ABM_QUERYPOS may slide the bar
    // along its edge, which is fine, but it also returns a rectangle whose
    // depth we must re-apply — otherwise the dock reserves either nothing or
    // the entire screen.
    let sized = match edge {
        DockEdge::Left => RECT {
            right: proposed.left + thickness,
            ..proposed
        },
        DockEdge::Right => RECT {
            left: proposed.right - thickness,
            ..proposed
        },
        DockEdge::Top => RECT {
            bottom: proposed.top + thickness,
            ..proposed
        },
        DockEdge::Bottom => RECT {
            top: proposed.bottom - thickness,
            ..proposed
        },
    };

    // Never reserve outside the monitor: the shell occasionally proposes a
    // rectangle spanning the whole virtual desktop.
    RECT {
        left: sized.left.max(monitor.x),
        top: sized.top.max(monitor.y),
        right: sized.right.min(monitor.right()),
        bottom: sized.bottom.min(monitor.bottom()),
    }
}

/// Install the crash-time restore routes.
///
/// Must be called before anything hides the taskbar. Two routes are installed
/// here; the third (normal shutdown) is the caller's `restore` call and the
/// fourth (the guardian process) is separate, because only a separate process
/// survives `TerminateProcess`.
pub fn install_crash_handlers(state: TaskbarState) {
    install_panic_hook(state);
    install_exception_filter();
}

/// Restore during an unwinding panic.
///
/// Chained rather than replacing: the default hook prints the panic message,
/// and losing that would make every crash undiagnosable.
fn install_panic_hook(state: TaskbarState) {
    let previous = std::panic::take_hook();

    std::panic::set_hook(Box::new(move |info| {
        let _ = restore(&state, RestoreReason::Panic);
        previous(info);
    }));
}

/// Restore on a hard fault — an access violation, a stack overflow, anything
/// that never reaches Rust's unwinding machinery.
fn install_exception_filter() {
    // SAFETY: registering a filter function with a `'static` lifetime. The
    // filter itself does no allocation and takes no locks.
    unsafe {
        SetUnhandledExceptionFilter(Some(on_unhandled_exception));
    }
}

unsafe extern "system" fn on_unhandled_exception(_info: *const EXCEPTION_POINTERS) -> i32 {
    // The allocator and any lock may be unusable on a faulted thread, so this
    // deliberately uses the minimal path rather than the state-aware one.
    restore_minimal();

    // Keep searching, so Windows Error Reporting still produces a crash dump.
    // Swallowing the exception here would hide the bug that caused it.
    EXCEPTION_CONTINUE_SEARCH
}

/// Command-line flag identifying a guardian process.
pub const GUARDIAN_FLAG: &str = "--restore-taskbar-guardian";

/// Start a guardian child that restores the taskbar if this process dies hard.
///
/// The panic hook and exception filter both run *inside* this process, so
/// neither survives `TerminateProcess`, a killed process tree, or a bug that
/// corrupts the stack badly enough that no handler executes. A separate
/// process does.
///
/// It re-executes our own binary with a flag rather than shipping a second
/// executable: one binary to sign, one to install, and no chance of the two
/// drifting apart.
pub fn spawn_guardian() -> Result<std::process::Child> {
    let exe = std::env::current_exe()
        .map_err(|e| PlatformError::Shell(format!("locating our own executable: {e}")))?;

    std::process::Command::new(exe)
        .arg(GUARDIAN_FLAG)
        .arg(std::process::id().to_string())
        .spawn()
        .map_err(|e| PlatformError::Shell(format!("spawning the taskbar guardian: {e}")))
}

/// Run as the guardian: wait for the parent to exit, then restore the taskbar.
///
/// Blocks until the parent process ends, however it ends. Restoring is
/// unconditional and idempotent — showing an already-visible taskbar is a
/// no-op, and guessing wrong in the other direction leaves the user stranded.
pub fn run_guardian(parent_pid: u32) {
    // SAFETY: SYNCHRONIZE is the minimum right needed to wait on a process.
    let handle = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, false, parent_pid) };

    let Ok(handle) = handle else {
        // The parent already exited, between spawning us and this call.
        // Restoring immediately is the right response, not a reason to give up.
        // SAFETY: minimal path, safe from any context.
        unsafe { restore_minimal() };
        return;
    };

    // SAFETY: `handle` is a valid process handle; INFINITE waits until it exits.
    unsafe {
        WaitForSingleObject(handle, INFINITE);
        let _ = CloseHandle(handle);
        restore_minimal();
    }

    eprintln!("developer-layer guardian: parent exited, native taskbar restored");
}
