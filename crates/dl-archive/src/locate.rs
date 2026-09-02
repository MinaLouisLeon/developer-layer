//! Finding WinRAR's console tools.
//!
//! WinRAR is not on `PATH` by default and has no App Paths entry for `Rar.exe`
//! — only for the GUI — so the console tools have to be found by their
//! directory. The registry knows it; the conventional install paths are the
//! fallback for a portable copy or a broken uninstall record.

use std::path::PathBuf;

use crate::plan::Tool;
use crate::{ArchiveError, Result};

/// A located WinRAR installation directory.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WinRar {
    directory: PathBuf,
}

impl WinRar {
    /// Use a known directory, without probing. The path the settings screen
    /// hands over when the user points at a portable copy.
    pub fn at(directory: impl Into<PathBuf>) -> Self {
        Self {
            directory: directory.into(),
        }
    }

    pub fn directory(&self) -> &std::path::Path {
        &self.directory
    }

    pub fn tool(&self, tool: Tool) -> PathBuf {
        self.directory.join(tool.file_name())
    }
}

/// Directories to probe, in the order they should be tried.
///
/// Pure so the ordering is a test rather than an assumption. `program_files`
/// carries the expansions of `%ProgramFiles%` and `%ProgramFiles(x86)%`; a
/// 64-bit WinRAR on a 64-bit host is by far the common case, so it comes
/// first, but a 32-bit install on the same machine is entirely normal and its
/// `Rar.exe` works just as well.
pub fn candidate_directories(program_files: &[String]) -> Vec<String> {
    program_files
        .iter()
        .filter(|root| !root.trim().is_empty())
        .map(|root| crate::winpath::join(root, "WinRAR"))
        .collect()
}

/// Find an installation, or say why not.
#[cfg(windows)]
pub fn locate() -> Result<WinRar> {
    let from_registry = registry_directory().into_iter();

    let roots: Vec<String> = ["ProgramFiles", "ProgramFiles(x86)"]
        .iter()
        .filter_map(|key| std::env::var(key).ok())
        .collect();

    from_registry
        .chain(candidate_directories(&roots))
        .map(PathBuf::from)
        // A directory only counts if it holds the tools we actually run.
        // WinRAR's installer offers to omit them, and a directory that merely
        // exists would send every later call into a "not found" from the OS.
        .find(|dir| dir.join(Tool::Rar.file_name()).is_file())
        .map(WinRar::at)
        .ok_or(ArchiveError::WinRarNotFound)
}

#[cfg(not(windows))]
pub fn locate() -> Result<WinRar> {
    Err(ArchiveError::Unsupported(
        "locate: WinRAR is a Windows application",
    ))
}

/// WinRAR records its install directory under its own key. `exe64` is a full
/// path to `WinRAR.exe`; the console tools sit beside it.
#[cfg(windows)]
fn registry_directory() -> Option<String> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let key = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SOFTWARE\WinRAR")
        .ok()?;

    for value in ["exe64", "exe32"] {
        if let Ok(path) = key.get_value::<String, _>(value) {
            if let Some(dir) = crate::winpath::parent(&path) {
                return Some(dir.to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_sixty_four_bit_install_is_tried_before_a_thirty_two_bit_one() {
        let roots = vec![
            r"C:\Program Files".to_string(),
            r"C:\Program Files (x86)".to_string(),
        ];
        assert_eq!(
            candidate_directories(&roots),
            vec![
                r"C:\Program Files\WinRAR".to_string(),
                r"C:\Program Files (x86)\WinRAR".to_string(),
            ]
        );
    }

    #[test]
    fn an_unset_environment_variable_does_not_produce_a_bare_winrar_path() {
        // `%ProgramFiles%` expanding to nothing would otherwise probe
        // `\WinRAR` at the root of the current drive.
        assert!(candidate_directories(&["".to_string(), "   ".to_string()]).is_empty());
    }

    #[test]
    fn the_tools_are_named_beside_the_installation() {
        let winrar = WinRar::at(r"C:\Program Files\WinRAR");
        assert_eq!(
            winrar.tool(Tool::Rar),
            PathBuf::from(r"C:\Program Files\WinRAR").join("Rar.exe")
        );
        assert_eq!(
            winrar.tool(Tool::UnRar),
            PathBuf::from(r"C:\Program Files\WinRAR").join("UnRAR.exe")
        );
    }
}
