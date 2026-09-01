//! Display enumeration with stable identity.
//!
//! `\\.\DISPLAY1` is not stable — Windows reassigns those names across reboots
//! and replugs, so keying layouts to them scrambles the workspace. Identity
//! comes instead from `QueryDisplayConfig` →
//! `DISPLAYCONFIG_TARGET_DEVICE_NAME.monitorDevicePath`, which embeds an
//! EDID-derived instance ID that survives both.
//!
//! The GDI name is still needed as the join key between the two APIs:
//! `EnumDisplayMonitors` gives geometry keyed by GDI name, and
//! `QueryDisplayConfig` gives the stable path keyed by the same name.

use std::collections::HashMap;

use dl_core::{Monitor, MonitorId, Rect};
use windows::core::BOOL;
use windows::Win32::Devices::Display::{
    DisplayConfigGetDeviceInfo, GetDisplayConfigBufferSizes, QueryDisplayConfig,
    DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME, DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME,
    DISPLAYCONFIG_DEVICE_INFO_HEADER, DISPLAYCONFIG_MODE_INFO, DISPLAYCONFIG_PATH_INFO,
    DISPLAYCONFIG_SOURCE_DEVICE_NAME, DISPLAYCONFIG_TARGET_DEVICE_NAME, QDC_ONLY_ACTIVE_PATHS,
};
use windows::Win32::Foundation::{ERROR_SUCCESS, LPARAM, RECT, TRUE};
use windows::Win32::Graphics::Gdi::{
    EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFOEXW,
};
use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
use windows::Win32::UI::WindowsAndMessaging::MONITORINFOF_PRIMARY;

use crate::error::last_error;
use dl_platform::{PlatformError, Result};

/// Windows reports 96 DPI as 100% scaling.
const BASE_DPI: f32 = 96.0;

pub fn enumerate() -> Result<Vec<Monitor>> {
    let stable = stable_identities().unwrap_or_default();
    let mut raw: Vec<RawMonitor> = Vec::new();

    // SAFETY: `collect_monitor` only pushes to the Vec pointed at by `lparam`,
    // which outlives this synchronous call.
    unsafe {
        EnumDisplayMonitors(
            None,
            None,
            Some(collect_monitor),
            LPARAM(&mut raw as *mut Vec<RawMonitor> as isize),
        )
        .ok()
        .map_err(|e| last_error("EnumDisplayMonitors", e))?;
    }

    if raw.is_empty() {
        return Err(PlatformError::DisplayEnumeration(
            "EnumDisplayMonitors returned no displays".into(),
        ));
    }

    Ok(raw
        .into_iter()
        .map(|m| {
            // Fall back to the GDI name only when QueryDisplayConfig could not
            // supply a stable path. Layouts keyed this way will not survive a
            // replug, but a working session beats no displays at all.
            let id = stable
                .get(&m.gdi_name)
                .cloned()
                .map(|entry| (MonitorId::new(entry.device_path), entry.friendly_name))
                .unwrap_or_else(|| (MonitorId::new(m.gdi_name.clone()), m.gdi_name.clone()));

            Monitor {
                id: id.0,
                name: if id.1.is_empty() { m.gdi_name } else { id.1 },
                bounds: m.bounds,
                work_area: m.work_area,
                scale_factor: m.scale_factor,
                is_primary: m.is_primary,
            }
        })
        .collect())
}

struct RawMonitor {
    gdi_name: String,
    bounds: Rect,
    work_area: Rect,
    scale_factor: f32,
    is_primary: bool,
}

unsafe extern "system" fn collect_monitor(
    hmonitor: HMONITOR,
    _hdc: HDC,
    _clip: *mut RECT,
    lparam: LPARAM,
) -> BOOL {
    let out = &mut *(lparam.0 as *mut Vec<RawMonitor>);

    let mut info = MONITORINFOEXW {
        monitorInfo: windows::Win32::Graphics::Gdi::MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFOEXW>() as u32,
            ..Default::default()
        },
        ..Default::default()
    };

    if GetMonitorInfoW(hmonitor, &mut info as *mut MONITORINFOEXW as *mut _).as_bool() {
        // Per-monitor DPI: a mixed-DPI setup is exactly why each display is
        // handled independently rather than as one virtual surface.
        let mut dpi_x = BASE_DPI as u32;
        let mut dpi_y = BASE_DPI as u32;
        let _ = GetDpiForMonitor(hmonitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y);

        out.push(RawMonitor {
            gdi_name: String::from_utf16_lossy(&info.szDevice)
                .trim_end_matches('\0')
                .to_string(),
            bounds: to_rect(info.monitorInfo.rcMonitor),
            work_area: to_rect(info.monitorInfo.rcWork),
            scale_factor: dpi_x as f32 / BASE_DPI,
            is_primary: info.monitorInfo.dwFlags & MONITORINFOF_PRIMARY != 0,
        });
    }

    TRUE
}

fn to_rect(r: RECT) -> Rect {
    Rect::new(r.left, r.top, r.right - r.left, r.bottom - r.top)
}

#[derive(Clone)]
struct StableIdentity {
    device_path: String,
    friendly_name: String,
}

/// Map GDI device name (`\\.\DISPLAY1`) to its EDID-derived stable path.
///
/// Returns `None` on failure rather than erroring: enumeration falls back to
/// GDI names, which is degraded but usable.
fn stable_identities() -> Option<HashMap<String, StableIdentity>> {
    let mut path_count = 0u32;
    let mut mode_count = 0u32;

    // SAFETY: writing two u32 out-params.
    let sizes = unsafe {
        GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &mut path_count, &mut mode_count)
    };
    if sizes != ERROR_SUCCESS {
        return None;
    }

    let mut paths = vec![DISPLAYCONFIG_PATH_INFO::default(); path_count as usize];
    let mut modes = vec![DISPLAYCONFIG_MODE_INFO::default(); mode_count as usize];

    // SAFETY: both buffers are sized by the counts returned above.
    let query = unsafe {
        QueryDisplayConfig(
            QDC_ONLY_ACTIVE_PATHS,
            &mut path_count,
            paths.as_mut_ptr(),
            &mut mode_count,
            modes.as_mut_ptr(),
            None,
        )
    };
    if query != ERROR_SUCCESS {
        return None;
    }

    let mut out = HashMap::new();

    for path in paths.iter().take(path_count as usize) {
        // The source name is the GDI name, which joins to EnumDisplayMonitors.
        let mut source = DISPLAYCONFIG_SOURCE_DEVICE_NAME {
            header: DISPLAYCONFIG_DEVICE_INFO_HEADER {
                r#type: DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME,
                size: std::mem::size_of::<DISPLAYCONFIG_SOURCE_DEVICE_NAME>() as u32,
                adapterId: path.sourceInfo.adapterId,
                id: path.sourceInfo.id,
            },
            ..Default::default()
        };
        // SAFETY: header describes the struct exactly.
        if unsafe { DisplayConfigGetDeviceInfo(&mut source.header) } != ERROR_SUCCESS.0 as i32 {
            continue;
        }

        // The target name carries the EDID-derived device path.
        let mut target = DISPLAYCONFIG_TARGET_DEVICE_NAME {
            header: DISPLAYCONFIG_DEVICE_INFO_HEADER {
                r#type: DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME,
                size: std::mem::size_of::<DISPLAYCONFIG_TARGET_DEVICE_NAME>() as u32,
                adapterId: path.targetInfo.adapterId,
                id: path.targetInfo.id,
            },
            ..Default::default()
        };
        // SAFETY: header describes the struct exactly.
        if unsafe { DisplayConfigGetDeviceInfo(&mut target.header) } != ERROR_SUCCESS.0 as i32 {
            continue;
        }

        let gdi_name = String::from_utf16_lossy(&source.viewGdiDeviceName)
            .trim_end_matches('\0')
            .to_string();
        let device_path = String::from_utf16_lossy(&target.monitorDevicePath)
            .trim_end_matches('\0')
            .to_string();
        let friendly_name = String::from_utf16_lossy(&target.monitorFriendlyDeviceName)
            .trim_end_matches('\0')
            .to_string();

        if !gdi_name.is_empty() && !device_path.is_empty() {
            out.insert(
                gdi_name,
                StableIdentity {
                    device_path,
                    friendly_name,
                },
            );
        }
    }

    Some(out)
}
