//! Archive actions for Developer Layer's file tree.
//!
//! The locked decision is *"WinRAR: no GUI. Archive actions in mino's file
//! tree via `rar.exe`."* This crate is that: it drives WinRAR's **console**
//! tools — `Rar.exe` and `UnRAR.exe` — and never launches `WinRAR.exe`, which
//! would open a window, ignore the caller's choices and return before it had
//! finished.
//!
//! The split follows the same rule as the rest of the workspace. Building a
//! command line is pure logic in [`plan`], so every switch is a test; running
//! it is [`run`]; finding the tools is [`locate`]. Only the middle one needs a
//! Windows machine.
//!
//! ## Scope
//!
//! RAR archives only. `UnRAR.exe` reads no other format and `Rar.exe` writes
//! no other one, so a `.zip` is reported as [`ArchiveError::UnsupportedFormat`]
//! rather than quietly handed to the GUI. Adding zip means adding a Rust
//! archiver, not relaxing that.

pub mod locate;
pub mod plan;
pub mod run;
mod winpath;

pub use locate::{locate, WinRar};
pub use plan::{archive_name_for, Compression, Overwrite, Plan, Tool};
pub use run::ArchiveOutcome;

#[derive(Debug, thiserror::Error)]
pub enum ArchiveError {
    #[error("WinRAR is not installed, or its console tools were left out of the installation")]
    WinRarNotFound,
    #[error("{0} is not an archive Developer Layer can open — RAR only")]
    UnsupportedFormat(String),
    #[error("nothing was selected to compress")]
    NothingToCompress,
    #[error("an empty {0} path was given")]
    EmptyPath(&'static str),
    #[error("the archive matched no files")]
    NoMatchingFiles,
    #[error("the archive is encrypted and needs a password")]
    PasswordRequired,
    #[error("{0}")]
    Failed(String),
    #[error("not supported on this platform: {0}")]
    Unsupported(&'static str),
}

pub type Result<T> = std::result::Result<T, ArchiveError>;

// The Tauri layer turns every error into a string for the UI, and serde is how
// it crosses. A message is enough: the UI shows it and offers no recovery that
// depends on the variant, except the two it can act on.
impl serde::Serialize for ArchiveError {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

/// Whether this crate can open the named file, judged on its extension.
///
/// Deliberately not a content sniff. The file tree asks this to decide whether
/// to *offer* extraction, which happens for every row it draws; reading the
/// first bytes of every file on screen to answer it would be absurd.
pub fn is_supported_archive(name: &str) -> bool {
    matches!(
        winpath::split_extension(winpath::basename(name)).1,
        Some(ext) if ext.eq_ignore_ascii_case("rar")
    )
}

/// Extract `archive` into a folder beside it, named after the archive.
///
/// A RAR holding loose files at its root would otherwise scatter them across
/// the folder it was extracted in. Unpacking into `<name>\` always leaves one
/// new folder, which is undoable by deleting it.
pub fn extract_beside(
    winrar: &WinRar,
    archive: &str,
    overwrite: Overwrite,
) -> Result<ArchiveOutcome> {
    if !is_supported_archive(archive) {
        return Err(ArchiveError::UnsupportedFormat(
            winpath::basename(archive).to_string(),
        ));
    }

    let (stem, _) = winpath::split_extension(winpath::basename(archive));
    let destination = match winpath::parent(archive) {
        Some(dir) => winpath::join(dir, stem),
        None => stem.to_string(),
    };

    let plan = plan::extract(&winrar.tool(Tool::UnRar), archive, &destination, overwrite)?;
    run::run(&plan, destination)
}

/// Compress `paths` into a RAR beside them.
pub fn compress_selection(
    winrar: &WinRar,
    paths: &[String],
    compression: Compression,
) -> Result<ArchiveOutcome> {
    let archive = archive_name_for(paths)?;
    let plan = plan::compress(&winrar.tool(Tool::Rar), &archive, paths, compression)?;
    run::run(&plan, archive)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extraction_is_offered_for_rar_and_nothing_else() {
        assert!(is_supported_archive(r"C:\dl\notes.rar"));
        // Case comes from the filesystem, which does not normalise it.
        assert!(is_supported_archive("NOTES.RAR"));
        assert!(!is_supported_archive(r"C:\dl\notes.zip"));
        assert!(!is_supported_archive(r"C:\dl\notes"));
        // `C:\rar\notes.txt` must not match on the folder's name.
        assert!(!is_supported_archive(r"C:\rar\notes.txt"));
    }

    #[test]
    fn a_zip_is_refused_by_name_rather_than_handed_to_the_gui() {
        let winrar = WinRar::at(r"C:\Program Files\WinRAR");
        let err =
            extract_beside(&winrar, r"C:\dl\notes.zip", Overwrite::Skip).expect_err("unsupported");
        assert!(matches!(err, ArchiveError::UnsupportedFormat(name) if name == "notes.zip"));
    }
}
