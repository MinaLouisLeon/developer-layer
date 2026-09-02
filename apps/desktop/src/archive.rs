//! Archive commands for the workbench's file tree.
//!
//! Dispatch only, on the same terms as every other command module: the tool
//! is located and the plan is built in `dl-archive`, which is where the rules
//! are tested.
//!
//! WinRAR is located once per call rather than cached. Locating it is two
//! registry reads against an operation that spawns a process and reads a
//! disk, and caching would mean a user who installs WinRAR while the shell is
//! running has to restart it to get the menu working.

use dl_archive::{ArchiveError, ArchiveOutcome, Compression, Overwrite};

/// Whether the file tree should offer archive actions at all.
///
/// Answered here rather than in the UI so "is WinRAR installed" has one
/// answer, and answered by locating the console tools rather than by looking
/// for the application: WinRAR's installer can leave `Rar.exe` out, and a menu
/// that appears and then always fails is worse than no menu.
#[tauri::command]
pub fn archive_available() -> bool {
    dl_archive::locate().is_ok()
}

#[tauri::command]
pub fn archive_supported(path: String) -> bool {
    dl_archive::is_supported_archive(&path)
}

/// Unpack `path` into a new folder beside it, named after the archive.
#[tauri::command]
pub fn archive_extract(
    path: String,
    overwrite: Option<Overwrite>,
) -> Result<ArchiveOutcome, ArchiveError> {
    let winrar = dl_archive::locate()?;
    dl_archive::extract_beside(&winrar, &path, overwrite.unwrap_or_default())
}

/// Pack the selection into one RAR beside it.
#[tauri::command]
pub fn archive_compress(
    paths: Vec<String>,
    compression: Option<Compression>,
) -> Result<ArchiveOutcome, ArchiveError> {
    let winrar = dl_archive::locate()?;
    dl_archive::compress_selection(&winrar, &paths, compression.unwrap_or_default())
}
