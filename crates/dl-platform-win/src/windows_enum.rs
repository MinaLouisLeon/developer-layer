//! Window enumeration.
//!
//! Reports raw facts only. Deciding what a window *means* — tile, float,
//! ignore — belongs to `dl-wm::rules`, which is testable off-Windows.

use std::path::PathBuf;

use dl_core::{Rect, WindowAttributes, WindowId};
use windows::core::BOOL;
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, MAX_PATH, RECT, TRUE};
use windows::Win32::Graphics::Dwm::{
    DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS,
};
use windows::Win32::Storage::Packaging::Appx::GetApplicationUserModelId;
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetWindow, GetWindowLongPtrW, GetWindowRect, GetWindowTextW,
    GetWindowThreadProcessId, IsIconic, IsWindowVisible, IsZoomed, GWL_EXSTYLE, GWL_STYLE,
    GW_OWNER, WS_EX_TOOLWINDOW, WS_THICKFRAME,
};

use crate::error::last_error;
use dl_platform::Result;

/// Enumerate every top-level window as raw attributes.
pub fn enumerate() -> Result<Vec<WindowAttributes>> {
    let mut handles: Vec<HWND> = Vec::with_capacity(256);

    // SAFETY: `collect_handle` only pushes to the Vec pointed at by `lparam`,
    // which outlives the call because EnumWindows is synchronous.
    unsafe {
        EnumWindows(
            Some(collect_handle),
            LPARAM(&mut handles as *mut Vec<HWND> as isize),
        )
        .map_err(|e| last_error("EnumWindows", e))?;
    }

    Ok(handles.into_iter().filter_map(describe).collect())
}

unsafe extern "system" fn collect_handle(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let handles = &mut *(lparam.0 as *mut Vec<HWND>);
    handles.push(hwnd);
    TRUE
}

/// Read every fact `dl-wm` needs about one window.
///
/// Returns `None` only when the window vanished mid-enumeration, which is
/// routine — windows close while we walk the list.
fn describe(hwnd: HWND) -> Option<WindowAttributes> {
    let outer_bounds = window_rect(hwnd)?;

    // The extended frame is what the user sees. Falling back to the outer rect
    // keeps the padding at zero rather than inventing a correction.
    let frame_bounds = extended_frame_bounds(hwnd).unwrap_or(outer_bounds);

    // SAFETY: hwnd came from EnumWindows; these calls tolerate a stale handle
    // by returning zero/false rather than faulting.
    let (style, ex_style, is_visible, is_minimized, is_maximized, has_owner) = unsafe {
        (
            GetWindowLongPtrW(hwnd, GWL_STYLE) as u32,
            GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32,
            IsWindowVisible(hwnd).as_bool(),
            IsIconic(hwnd).as_bool(),
            IsZoomed(hwnd).as_bool(),
            GetWindow(hwnd, GW_OWNER).is_ok_and(|owner| !owner.is_invalid()),
        )
    };

    let (executable, aumid) = process_identity(hwnd);

    Some(WindowAttributes {
        id: WindowId(hwnd.0 as u64),
        title: window_text(hwnd),
        class_name: class_name(hwnd),
        executable,
        aumid,
        outer_bounds,
        frame_bounds,
        is_visible,
        is_cloaked: is_cloaked(hwnd),
        is_tool_window: ex_style & WS_EX_TOOLWINDOW.0 != 0,
        has_owner,
        is_resizable: style & WS_THICKFRAME.0 != 0,
        is_minimized,
        is_maximized,
    })
}

/// Windows 11 keeps cloaked ghost windows for suspended UWP apps. Without this
/// check the dock fills with phantom entries that cannot be focused.
fn is_cloaked(hwnd: HWND) -> bool {
    let mut cloaked: u32 = 0;

    // SAFETY: writing a u32 into a correctly sized, aligned local.
    let ok = unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            &mut cloaked as *mut u32 as *mut _,
            std::mem::size_of::<u32>() as u32,
        )
    };

    // A window whose cloak state cannot be read is treated as visible; failing
    // closed here would silently drop real windows.
    ok.is_ok() && cloaked != 0
}

fn extended_frame_bounds(hwnd: HWND) -> Option<Rect> {
    let mut rect = RECT::default();

    // SAFETY: writing a RECT into a correctly sized, aligned local.
    let ok = unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut rect as *mut RECT as *mut _,
            std::mem::size_of::<RECT>() as u32,
        )
    };

    ok.ok().map(|()| to_rect(rect))
}

fn window_rect(hwnd: HWND) -> Option<Rect> {
    let mut rect = RECT::default();
    // SAFETY: writing into a local RECT.
    unsafe { GetWindowRect(hwnd, &mut rect) }.ok()?;
    Some(to_rect(rect))
}

fn to_rect(r: RECT) -> Rect {
    Rect::new(r.left, r.top, r.right - r.left, r.bottom - r.top)
}

fn window_text(hwnd: HWND) -> String {
    let mut buf = [0u16; 512];
    // SAFETY: GetWindowTextW writes at most buf.len() UTF-16 units.
    let len = unsafe { GetWindowTextW(hwnd, &mut buf) };
    String::from_utf16_lossy(&buf[..len.max(0) as usize])
}

fn class_name(hwnd: HWND) -> String {
    let mut buf = [0u16; 256];
    // SAFETY: GetClassNameW writes at most buf.len() UTF-16 units.
    let len = unsafe { GetClassNameW(hwnd, &mut buf) };
    String::from_utf16_lossy(&buf[..len.max(0) as usize])
}

/// Resolve the owning process to an executable path and, for packaged apps, an
/// AppUserModelID.
///
/// Both are `None` when the process cannot be opened, which happens for
/// elevated processes while we are not elevated. That is why the shell
/// registers itself to auto-elevate at logon.
fn process_identity(hwnd: HWND) -> (Option<PathBuf>, Option<String>) {
    let mut pid: u32 = 0;
    // SAFETY: writing a u32 into a local.
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    if pid == 0 {
        return (None, None);
    }

    // SAFETY: a valid pid; the handle is closed on every path below.
    let handle = match unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) } {
        Ok(h) => h,
        Err(_) => return (None, None),
    };

    let mut path_buf = [0u16; MAX_PATH as usize];
    let mut path_len = path_buf.len() as u32;
    // SAFETY: path_len describes path_buf exactly.
    let executable = unsafe {
        QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_FORMAT(0),
            windows::core::PWSTR(path_buf.as_mut_ptr()),
            &mut path_len,
        )
    }
    .ok()
    .map(|()| PathBuf::from(String::from_utf16_lossy(&path_buf[..path_len as usize])));

    // Packaged (MSIX) apps such as WhatsApp have no useful executable path and
    // must be matched by AUMID instead.
    let mut aumid_buf = [0u16; 512];
    let mut aumid_len = aumid_buf.len() as u32;
    // SAFETY: aumid_len describes aumid_buf exactly.
    let aumid = unsafe {
        GetApplicationUserModelId(
            handle,
            &mut aumid_len,
            Some(windows::core::PWSTR(aumid_buf.as_mut_ptr())),
        )
    };
    let aumid = if aumid.is_ok() && aumid_len > 0 {
        // The returned length includes the terminating null.
        let end = (aumid_len as usize).saturating_sub(1);
        Some(String::from_utf16_lossy(&aumid_buf[..end]))
    } else {
        None
    };

    // SAFETY: handle came from OpenProcess and is not used afterwards.
    let _ = unsafe { CloseHandle(handle) };

    (executable, aumid)
}
