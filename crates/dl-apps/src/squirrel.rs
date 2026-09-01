//! Squirrel-packaged applications.
//!
//! Slack and several other Electron apps install through Squirrel, which lays
//! out `%LOCALAPPDATA%\slack\` as an `Update.exe` stub beside one `app-x.y.z`
//! directory per installed version. Updates add a new directory and may leave
//! the old one behind, so "the executable" is whichever version is newest.
//!
//! The trap: **versions must be compared numerically, not as strings.**
//! Lexicographically `app-4.9.0` sorts *after* `app-4.10.0`, so a naive
//! `max()` over directory names pins the dock to an older build that Squirrel
//! will eventually delete — at which point the icon and launcher silently stop
//! working, months after anyone touched this code.

use std::path::{Path, PathBuf};

/// A parsed `app-x.y.z` directory.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Version {
    /// Ordered first so derived `Ord` compares numerically, component by
    /// component, which is exactly the semantics we need.
    parts: Vec<u64>,
}

impl Version {
    /// Parse `app-4.35.126` into its numeric components.
    ///
    /// Returns `None` for anything that is not a version directory, so stray
    /// files and Squirrel's own `packages` folder are ignored rather than
    /// sorted as version zero.
    fn parse(dir_name: &str) -> Option<Self> {
        let rest = dir_name.strip_prefix("app-")?;

        // Pre-release suffixes such as `4.35.126-beta.2` do occur; the numeric
        // prefix is what orders them, and the suffix is discarded rather than
        // failing the whole parse.
        let numeric = rest
            .split(|c: char| !c.is_ascii_digit() && c != '.')
            .next()
            .unwrap_or("");

        let parts: Vec<u64> = numeric
            .split('.')
            .filter(|s| !s.is_empty())
            .map(|s| s.parse().ok())
            .collect::<Option<Vec<u64>>>()?;

        if parts.is_empty() {
            return None;
        }

        Some(Self { parts })
    }
}

/// Find the newest `app-x.y.z\<exe_name>` under a Squirrel install root.
///
/// Returns `None` when the root does not exist, holds no version directories,
/// or none of them contain the executable.
pub fn newest_executable(root: &Path, exe_name: &str) -> Option<PathBuf> {
    let entries = std::fs::read_dir(root).ok()?;

    let mut candidates: Vec<(Version, PathBuf)> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_ok_and(|t| t.is_dir()))
        .filter_map(|entry| {
            let name = entry.file_name();
            let version = Version::parse(&name.to_string_lossy())?;
            let exe = entry.path().join(exe_name);
            // A version directory mid-update may not hold the executable yet.
            exe.is_file().then_some((version, exe))
        })
        .collect();

    // Numeric comparison, so 4.10.0 correctly beats 4.9.0.
    candidates.sort_by(|a, b| a.0.cmp(&b.0));
    candidates.pop().map(|(_, path)| path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn install(versions: &[&str], exe: &str) -> tempfile::TempDir {
        let dir = tempfile::tempdir().expect("tempdir");
        for version in versions {
            let sub = dir.path().join(version);
            std::fs::create_dir_all(&sub).expect("create version dir");
            std::fs::write(sub.join(exe), b"").expect("create exe");
        }
        // Squirrel's stub, which sits beside the version directories.
        std::fs::write(dir.path().join("Update.exe"), b"").expect("create stub");
        dir
    }

    #[test]
    fn the_newest_version_wins() {
        let dir = install(&["app-4.35.126", "app-4.36.140"], "slack.exe");

        let found = newest_executable(dir.path(), "slack.exe").expect("resolves");

        assert!(found.ends_with("app-4.36.140/slack.exe"));
    }

    #[test]
    fn versions_are_compared_numerically_not_as_strings() {
        // The bug this module exists to prevent: lexicographically "4.9.0"
        // sorts after "4.10.0", pinning the dock to a build Squirrel will
        // eventually delete.
        let dir = install(&["app-4.9.0", "app-4.10.0"], "slack.exe");

        let found = newest_executable(dir.path(), "slack.exe").expect("resolves");

        assert!(
            found.ends_with("app-4.10.0/slack.exe"),
            "picked {found:?} — string ordering leaked through"
        );
    }

    #[test]
    fn a_four_component_version_orders_correctly() {
        let dir = install(&["app-1.2.3.9", "app-1.2.3.10"], "app.exe");

        let found = newest_executable(dir.path(), "app.exe").expect("resolves");

        assert!(found.ends_with("app-1.2.3.10/app.exe"));
    }

    #[test]
    fn a_shorter_version_loses_to_a_longer_one_with_the_same_prefix() {
        let dir = install(&["app-4.35", "app-4.35.1"], "slack.exe");

        let found = newest_executable(dir.path(), "slack.exe").expect("resolves");

        assert!(found.ends_with("app-4.35.1/slack.exe"));
    }

    #[test]
    fn non_version_directories_are_ignored() {
        // Squirrel leaves `packages` alongside the version directories.
        let dir = install(&["app-4.35.126"], "slack.exe");
        let packages = dir.path().join("packages");
        std::fs::create_dir_all(&packages).expect("create packages");
        std::fs::write(packages.join("slack.exe"), b"").expect("decoy");

        let found = newest_executable(dir.path(), "slack.exe").expect("resolves");

        assert!(found.ends_with("app-4.35.126/slack.exe"));
    }

    #[test]
    fn a_version_directory_without_the_executable_is_skipped() {
        // Happens mid-update: the directory exists before it is populated.
        let dir = install(&["app-4.35.126"], "slack.exe");
        std::fs::create_dir_all(dir.path().join("app-4.36.0")).expect("empty newer dir");

        let found = newest_executable(dir.path(), "slack.exe").expect("resolves");

        assert!(
            found.ends_with("app-4.35.126/slack.exe"),
            "an empty newer directory must not win"
        );
    }

    #[test]
    fn a_prerelease_suffix_still_parses() {
        let dir = install(&["app-4.35.126", "app-4.36.0-beta.2"], "slack.exe");

        let found = newest_executable(dir.path(), "slack.exe").expect("resolves");

        assert!(found.ends_with("app-4.36.0-beta.2/slack.exe"));
    }

    #[test]
    fn a_missing_install_root_resolves_to_nothing() {
        assert_eq!(
            newest_executable(Path::new("/definitely/not/installed"), "slack.exe"),
            None
        );
    }

    #[test]
    fn an_install_with_no_version_directories_resolves_to_nothing() {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir.path().join("Update.exe"), b"").expect("stub");

        assert_eq!(newest_executable(dir.path(), "slack.exe"), None);
    }

    #[test]
    fn version_parsing_rejects_non_version_names() {
        assert_eq!(Version::parse("packages"), None);
        assert_eq!(Version::parse("app-"), None);
        assert_eq!(Version::parse("Update.exe"), None);
        assert!(Version::parse("app-4.35.126").is_some());
    }
}
