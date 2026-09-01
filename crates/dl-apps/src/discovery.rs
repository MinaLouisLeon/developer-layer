//! Windows application discovery, icon extraction and launching.
//!
//! `AppsFolder` is the shell namespace behind the Start menu's "All apps". It
//! is the canonical list: every installed application appears there, packaged
//! or not, each carrying its AppUserModelID and an icon. Enumerating it once
//! gives both the AUMIDs that packaged apps need and a uniform icon source, so
//! WhatsApp and Chrome go through the same code rather than two.

use std::path::PathBuf;

use dl_core::AppRef;
use windows::core::{Interface, PCWSTR, PWSTR};
use windows::Win32::Foundation::SIZE;
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDIBits, GetObjectW, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
    DIB_RGB_COLORS, HDC,
};
use windows::Win32::System::Com::{CoInitializeEx, CoTaskMemFree, COINIT_APARTMENTTHREADED};
use windows::Win32::UI::Shell::Common::ITEMIDLIST;
use windows::Win32::UI::Shell::{
    IEnumIDList, IShellItem, IShellItemImageFactory, SHCreateItemFromParsingName,
    SHGetDesktopFolder, ShellExecuteW, SHGDNF, SHGDN_FORPARSING, SHGDN_NORMAL, SIIGBF_BIGGERSIZEOK,
};
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

use crate::catalog::{KnownApp, Resolved, Strategy, KNOWN_APPS};
use crate::icons::{IconError, ICON_SIZE};
use crate::launch::LaunchPlan;
use crate::squirrel;

/// The shell folder holding every installed application.
const APPS_FOLDER: &str = "shell:AppsFolder";

/// Resolve every catalog entry that is actually installed.
pub fn resolve_all() -> Vec<Resolved> {
    ensure_com();

    // Enumerated once and reused: walking the namespace per application would
    // repeat the most expensive part of discovery for each of seven apps.
    let packaged = enumerate_apps_folder().unwrap_or_default();

    KNOWN_APPS
        .iter()
        .filter_map(|app| resolve(app, &packaged))
        .collect()
}

/// One installed application as `AppsFolder` reported it.
#[derive(Debug, Clone)]
struct PackagedApp {
    aumid: String,
    display_name: String,
}

fn resolve(app: &KnownApp, packaged: &[PackagedApp]) -> Option<Resolved> {
    for strategy in app.strategies {
        let app_ref = match strategy {
            Strategy::AppPaths { exe } => app_paths_lookup(exe).map(AppRef::executable),
            Strategy::Squirrel {
                local_app_data_dir,
                exe,
            } => crate::catalog::KnownFolder::LocalAppData
                .path()
                .and_then(|base| squirrel::newest_executable(&base.join(local_app_data_dir), exe))
                .map(AppRef::executable),
            Strategy::Relative { base, rest } => base
                .path()
                .map(|b| b.join(rest))
                .filter(|p| p.is_file())
                .map(AppRef::executable),
            Strategy::Packaged { aumid_prefix } => {
                if let Some(found) = packaged.iter().find(|p| p.aumid.starts_with(aumid_prefix)) {
                    // The shell's own label is what the user recognises, and it
                    // stays right if the app renames itself.
                    let display_name = if found.display_name.is_empty() {
                        app.display_name.to_string()
                    } else {
                        found.display_name.clone()
                    };
                    return Some(Resolved {
                        id: app.app_id(),
                        display_name,
                        app_ref: AppRef::packaged(&found.aumid),
                    });
                }
                None
            }
            Strategy::ShellBuiltin { path } => Some(AppRef::executable(path)),
        };

        if let Some(app_ref) = app_ref {
            return Some(Resolved {
                id: app.app_id(),
                display_name: app.display_name.to_string(),
                app_ref,
            });
        }
    }

    // Not installed. Omitting it is correct — a dock entry that cannot start
    // anything is worse than no entry.
    None
}

/// Look up an executable in the registry's `App Paths`.
///
/// `HKCU` first: a per-user install shadows a machine-wide one, and that is the
/// one the user actually launches.
fn app_paths_lookup(exe: &str) -> Option<PathBuf> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let subkey = format!(r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{exe}");

    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let Ok(key) = RegKey::predef(hive).open_subkey(&subkey) else {
            continue;
        };
        // The default value holds the full path.
        let Ok(value) = key.get_value::<String, _>("") else {
            continue;
        };

        // Registered paths are sometimes quoted.
        let path = PathBuf::from(value.trim_matches('"'));
        if path.is_file() {
            return Some(path);
        }
    }

    None
}

/// Walk `shell:AppsFolder` for installed applications and their AUMIDs.
fn enumerate_apps_folder() -> Option<Vec<PackagedApp>> {
    let folder: IShellItem = shell_item(APPS_FOLDER)?;

    // SAFETY: BindToHandler on a folder item yields an enumerator; both are COM
    // objects released when they drop.
    let enumerator: IEnumIDList = unsafe {
        folder
            .BindToHandler::<_, IEnumIDList>(None, &windows::Win32::UI::Shell::BHID_EnumItems)
            .ok()?
    };

    let desktop = unsafe { SHGetDesktopFolder() }.ok()?;
    let mut found = Vec::new();

    loop {
        let mut item: [*mut ITEMIDLIST; 1] = [std::ptr::null_mut()];
        let mut fetched = 0u32;

        // SAFETY: writing one PIDL into a local array.
        if unsafe { enumerator.Next(&mut item, Some(&mut fetched)) }.is_err() || fetched == 0 {
            break;
        }

        let pidl = item[0];
        if pidl.is_null() {
            continue;
        }

        // The *parsing* name of an AppsFolder child is its AUMID; the normal
        // name is what the Start menu shows.
        // SAFETY: pidl is valid until CoTaskMemFree below.
        let aumid = unsafe { display_name_of(&desktop, pidl, SHGDN_FORPARSING) };
        let display_name = unsafe { display_name_of(&desktop, pidl, SHGDN_NORMAL) };

        if let Some(aumid) = aumid {
            found.push(PackagedApp {
                aumid,
                display_name: display_name.unwrap_or_default(),
            });
        }

        // SAFETY: the enumerator hands ownership of each PIDL to us.
        unsafe { CoTaskMemFree(Some(pidl as *const _)) };
    }

    Some(found)
}

/// Read one of a shell item's names.
///
/// # Safety
/// `pidl` must be a valid item identifier list belonging to `folder`.
unsafe fn display_name_of(
    folder: &windows::Win32::UI::Shell::IShellFolder,
    pidl: *mut ITEMIDLIST,
    flags: SHGDNF,
) -> Option<String> {
    let mut ret = windows::Win32::UI::Shell::Common::STRRET::default();
    folder.GetDisplayNameOf(pidl, flags, &mut ret).ok()?;

    let mut buffer = PWSTR::null();
    windows::Win32::UI::Shell::StrRetToStrW(&mut ret, Some(pidl), &mut buffer).ok()?;

    let text = buffer.to_string().ok();
    CoTaskMemFree(Some(buffer.as_ptr() as *const _));
    text
}

/// Extract an application's icon as PNG bytes.
///
/// Packaged and unpackaged apps share this path: both are shell items, and
/// `IShellItemImageFactory` renders either. For a packaged app the icon comes
/// from the package manifest rather than a binary's resources, which is why
/// reading the executable directly would not work for WhatsApp.
pub fn extract_icon(app_ref: &AppRef) -> crate::icons::Result<Vec<u8>> {
    ensure_com();

    let target = match app_ref {
        AppRef::Executable { path, .. } => path.to_string_lossy().into_owned(),
        AppRef::Packaged { aumid } => format!(r"{APPS_FOLDER}\{aumid}"),
    };

    let item: IShellItem = shell_item(&target)
        .ok_or_else(|| IconError::Extract(format!("no shell item for {target}")))?;

    let factory: IShellItemImageFactory = item
        .cast()
        .map_err(|e| IconError::Extract(format!("IShellItemImageFactory: {e}")))?;

    // BIGGERSIZEOK accepts a larger source than requested rather than failing,
    // which matters for apps that only ship a 48px icon.
    // SAFETY: the returned HBITMAP is owned by us and deleted below.
    let bitmap = unsafe {
        factory.GetImage(
            SIZE {
                cx: ICON_SIZE as i32,
                cy: ICON_SIZE as i32,
            },
            SIIGBF_BIGGERSIZEOK,
        )
    }
    .map_err(|e| IconError::Extract(format!("GetImage: {e}")))?;

    let png = bitmap_to_png(bitmap);

    // SAFETY: bitmap came from GetImage and is not used afterwards.
    unsafe {
        let _ = DeleteObject(bitmap.into());
    };

    png
}

/// Convert a 32-bit BGRA HBITMAP into PNG bytes.
fn bitmap_to_png(bitmap: windows::Win32::Graphics::Gdi::HBITMAP) -> crate::icons::Result<Vec<u8>> {
    let mut info = BITMAP::default();
    // SAFETY: writing a BITMAP into a local of the declared size.
    let read = unsafe {
        GetObjectW(
            bitmap.into(),
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut info as *mut BITMAP as *mut _),
        )
    };
    if read == 0 {
        return Err(IconError::Extract("GetObjectW returned no bitmap".into()));
    }

    let width = info.bmWidth;
    let height = info.bmHeight;
    let mut pixels = vec![0u8; (width * height * 4) as usize];

    let mut header = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            // Negative height requests a top-down DIB, matching PNG row order.
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };

    // SAFETY: pixels is sized for width * height * 4 as the header declares.
    let copied = unsafe {
        GetDIBits(
            HDC::default(),
            bitmap,
            0,
            height as u32,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut header,
            DIB_RGB_COLORS,
        )
    };
    if copied == 0 {
        return Err(IconError::Extract("GetDIBits copied no rows".into()));
    }

    // GDI hands back BGRA; PNG wants RGBA.
    for chunk in pixels.chunks_exact_mut(4) {
        chunk.swap(0, 2);
    }

    Ok(crate::icons::encode_png(
        width as u32,
        height as u32,
        &pixels,
    ))
}

/// Start an application.
pub fn launch(app_ref: &AppRef) -> std::result::Result<(), String> {
    match LaunchPlan::for_app(app_ref) {
        LaunchPlan::Process { program, args } => spawn(&program, &args),
        LaunchPlan::ShellActivate { target } => activate(&target),
    }
}

pub fn spawn(program: &std::path::Path, args: &[String]) -> std::result::Result<(), String> {
    std::process::Command::new(program)
        .args(args)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("spawning {}: {e}", program.display()))
}

/// Ask the shell to open a target, which is the only way to start a packaged app.
pub fn activate(target: &str) -> std::result::Result<(), String> {
    ensure_com();

    let wide: Vec<u16> = target.encode_utf16().chain(std::iter::once(0)).collect();

    // SAFETY: `wide` is null-terminated and outlives the call. ShellExecuteW
    // returns a value above 32 on success, by its documented convention.
    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR::null(),
            PCWSTR(wide.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };

    if result.0 as usize > 32 {
        Ok(())
    } else {
        Err(format!("ShellExecuteW refused {target}"))
    }
}

fn shell_item(parsing_name: &str) -> Option<IShellItem> {
    let wide: Vec<u16> = parsing_name
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();

    // SAFETY: `wide` is null-terminated and outlives the call.
    unsafe { SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None) }.ok()
}

/// Initialise COM for this thread, tolerating an existing initialisation.
///
/// Called from every entry point rather than once at startup: these run on
/// whichever thread Tauri dispatched the command to, and COM is per-thread.
fn ensure_com() {
    // SAFETY: repeated calls are safe; RPC_E_CHANGED_MODE simply means the
    // thread was already initialised in another apartment, which is fine here.
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    }
}
