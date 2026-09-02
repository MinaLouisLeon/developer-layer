//! Windows path splitting that does not depend on the host.
//!
//! `Path::file_name` is host-dependent: on Linux it does not treat `\` as a
//! separator, so `C:\a\b.rar` comes back whole. Every path this crate handles
//! is a Windows path regardless of where the code runs, and the tests run on
//! Linux — relying on the host's rules would make them agree with each other
//! and disagree with production.
//!
//! `dl-engine` carries the same six lines for the same reason. Duplicating
//! them is cheaper than a dependency in that direction.

/// Last component of a Windows path, split on both separators.
pub fn basename(path: &str) -> &str {
    match path.rsplit_once(['\\', '/']) {
        Some((_, name)) => name,
        None => path,
    }
}

/// Everything before the last separator, or `None` for a bare name.
pub fn parent(path: &str) -> Option<&str> {
    let (head, _) = path.rsplit_once(['\\', '/'])?;
    // `C:\file.rar` has parent `C:\`, not the empty string.
    if head.is_empty() {
        Some("\\")
    } else if head.ends_with(':') {
        None
    } else {
        Some(head)
    }
}

/// Split a name into stem and extension, on the **last** dot only.
///
/// A leading dot is part of the name, not an extension: `.gitignore` has no
/// extension, and treating it as one would name its archive `.rar`.
pub fn split_extension(name: &str) -> (&str, Option<&str>) {
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => (stem, Some(ext)),
        _ => (name, None),
    }
}

/// Join a directory and a name with a backslash, tolerating a trailing one.
pub fn join(dir: &str, name: &str) -> String {
    if dir.ends_with('\\') || dir.ends_with('/') {
        format!("{dir}{name}")
    } else {
        format!("{dir}\\{name}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basename_splits_windows_paths_on_any_host() {
        // Path::file_name returns the whole string here on Linux, which is
        // exactly the bug this function exists to avoid.
        assert_eq!(basename(r"C:\Users\mina\notes.rar"), "notes.rar");
        assert_eq!(basename("notes.rar"), "notes.rar");
        assert_eq!(basename("C:/Users/mina/notes.rar"), "notes.rar");
    }

    #[test]
    fn parent_keeps_the_root_and_rejects_a_bare_drive() {
        assert_eq!(parent(r"C:\Users\mina\notes.rar"), Some(r"C:\Users\mina"));
        assert_eq!(parent(r"\notes.rar"), Some("\\"));
        assert_eq!(parent(r"C:\notes.rar"), None);
        assert_eq!(parent("notes.rar"), None);
    }

    #[test]
    fn a_leading_dot_is_a_name_not_an_extension() {
        // Otherwise `.gitignore` compresses to an archive called `.rar`.
        assert_eq!(split_extension(".gitignore"), (".gitignore", None));
        assert_eq!(split_extension("notes.tar.gz"), ("notes.tar", Some("gz")));
        assert_eq!(split_extension("notes"), ("notes", None));
    }

    #[test]
    fn join_does_not_double_the_separator() {
        assert_eq!(join(r"C:\tmp", "a.rar"), r"C:\tmp\a.rar");
        assert_eq!(join(r"C:\tmp\", "a.rar"), r"C:\tmp\a.rar");
    }
}
