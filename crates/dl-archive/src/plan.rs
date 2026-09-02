//! Building a WinRAR command line, as pure logic.
//!
//! Nothing here runs a process. A [`Plan`] is a program path and an argument
//! vector, so every rule below — the switches, the trailing separator, the
//! end-of-switches guard — is asserted in a test rather than discovered on a
//! user's disk.
//!
//! Arguments are a vector, never a joined string. `Command` hands argv to the
//! process directly, so there is no quoting layer to get wrong and no path
//! containing a space or a quote that can turn into a second argument.

use crate::winpath;
use crate::{ArchiveError, Result};
use std::path::{Path, PathBuf};

/// Which WinRAR binary a plan runs.
///
/// Both are console tools. `WinRAR.exe` — the GUI — is deliberately absent:
/// the locked decision is archive actions *without* a window, and a GUI
/// invocation would also return before the work finished, so its exit code
/// would mean nothing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tool {
    /// `Rar.exe` — creates and updates archives.
    Rar,
    /// `UnRAR.exe` — extracts and lists them.
    UnRar,
}

impl Tool {
    pub fn file_name(self) -> &'static str {
        match self {
            Tool::Rar => "Rar.exe",
            Tool::UnRar => "UnRAR.exe",
        }
    }
}

/// What to do when extraction hits a file that already exists.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Default, serde::Serialize, serde::Deserialize, ts_rs::TS,
)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub enum Overwrite {
    /// `-o+` — replace it.
    Replace,
    /// `-o-` — leave it and carry on.
    #[default]
    Skip,
    /// `-or` — extract alongside it as `name(1).ext`.
    Rename,
}

impl Overwrite {
    fn switch(self) -> &'static str {
        match self {
            Overwrite::Replace => "-o+",
            Overwrite::Skip => "-o-",
            Overwrite::Rename => "-or",
        }
    }
}

/// Compression effort, mapped to RAR's `-m0`..`-m5`.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Default, serde::Serialize, serde::Deserialize, ts_rs::TS,
)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub enum Compression {
    /// `-m0` — store only. The right choice for already-compressed media.
    Store,
    /// `-m3` — RAR's own default.
    #[default]
    Normal,
    /// `-m5` — slowest and smallest.
    Best,
}

impl Compression {
    fn switch(self) -> &'static str {
        match self {
            Compression::Store => "-m0",
            Compression::Normal => "-m3",
            Compression::Best => "-m5",
        }
    }
}

/// A resolved command line: a program and its arguments, ready to run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Plan {
    pub program: PathBuf,
    pub args: Vec<String>,
}

impl Plan {
    fn new(program: &Path, args: Vec<String>) -> Self {
        Self {
            program: program.to_path_buf(),
            args,
        }
    }
}

/// Switches every plan carries.
///
/// `-idq` puts the tool in quiet mode: no copyright banner, no progress
/// redraw, and — the part that matters here — no interactive prompt. A prompt
/// would block forever, because nothing is attached to the tool's stdin.
///
/// `-y` is deliberately **not** among these. It answers *every* question yes,
/// including "overwrite?", which would silently override the caller's
/// [`Overwrite`] choice.
const QUIET: &str = "-idq";

/// Ends switch parsing.
///
/// Without it a file named `-notes.rar` is read as a switch and the operation
/// either fails obscurely or does something else entirely. Every plan emits it
/// immediately before the first path.
const END_OF_SWITCHES: &str = "--";

/// `UnRAR.exe x archive dest` — extract with full paths.
///
/// The destination **must** end in a separator. Without one, UnRAR treats the
/// last argument as a file name to extract rather than a directory to extract
/// into, and silently unpacks into the current directory instead.
pub fn extract(unrar: &Path, archive: &str, into: &str, overwrite: Overwrite) -> Result<Plan> {
    reject_empty(archive, "archive")?;
    reject_empty(into, "destination")?;

    let destination = if into.ends_with('\\') || into.ends_with('/') {
        into.to_string()
    } else {
        format!("{into}\\")
    };

    Ok(Plan::new(
        unrar,
        vec![
            "x".into(),
            QUIET.into(),
            overwrite.switch().into(),
            END_OF_SWITCHES.into(),
            archive.into(),
            destination,
        ],
    ))
}

/// `Rar.exe a archive members...` — create or update an archive.
///
/// `-ep1` strips the base directory from stored names. Without it an archive
/// built from `C:\Users\mina\src` unpacks as `Users\mina\src\...`, which is
/// never what a "compress this folder" action means. `-r` recurses into the
/// directories named.
pub fn compress(
    rar: &Path,
    archive: &str,
    members: &[String],
    compression: Compression,
) -> Result<Plan> {
    reject_empty(archive, "archive")?;
    if members.is_empty() {
        return Err(ArchiveError::NothingToCompress);
    }
    for member in members {
        reject_empty(member, "member")?;
    }

    let mut args = vec![
        "a".into(),
        QUIET.into(),
        "-r".into(),
        "-ep1".into(),
        compression.switch().into(),
        END_OF_SWITCHES.into(),
        archive.into(),
    ];
    args.extend(members.iter().cloned());

    Ok(Plan::new(rar, args))
}

/// `UnRAR.exe lb archive` — bare list, one entry path per line.
pub fn list(unrar: &Path, archive: &str) -> Result<Plan> {
    reject_empty(archive, "archive")?;
    Ok(Plan::new(
        unrar,
        vec![
            "lb".into(),
            QUIET.into(),
            END_OF_SWITCHES.into(),
            archive.into(),
        ],
    ))
}

/// The archive path a "compress" action on `paths` should produce.
///
/// One selected item names the archive after it, with any extension replaced —
/// `notes.txt` becomes `notes.rar`, and a folder `src` becomes `src.rar`. A
/// multiple selection has no such name, so it falls back to the containing
/// folder's. The result always sits beside the selection, never in the
/// process's working directory.
pub fn archive_name_for(paths: &[String]) -> Result<String> {
    let first = paths.first().ok_or(ArchiveError::NothingToCompress)?;
    reject_empty(first, "member")?;

    let directory = winpath::parent(first);

    let stem = if paths.len() == 1 {
        let (stem, _) = winpath::split_extension(winpath::basename(first));
        stem.to_string()
    } else {
        // No single name fits, so borrow the folder they share.
        directory
            .map(|d| winpath::basename(d).to_string())
            .filter(|d| !d.is_empty() && !d.ends_with(':') && d != "\\")
            .unwrap_or_else(|| "archive".into())
    };

    let file = format!("{stem}.rar");
    Ok(match directory {
        Some(dir) => winpath::join(dir, &file),
        None => file,
    })
}

fn reject_empty(value: &str, what: &'static str) -> Result<()> {
    if value.trim().is_empty() {
        Err(ArchiveError::EmptyPath(what))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tool(name: &str) -> PathBuf {
        PathBuf::from(format!(r"C:\Program Files\WinRAR\{name}"))
    }

    #[test]
    fn extract_appends_a_separator_to_the_destination() {
        // Without the trailing separator UnRAR reads the destination as a file
        // name to extract and unpacks into the working directory instead.
        let plan = extract(
            &tool("UnRAR.exe"),
            r"C:\dl\notes.rar",
            r"C:\dl\out",
            Overwrite::Skip,
        )
        .expect("plan");
        assert_eq!(plan.args.last().expect("destination"), r"C:\dl\out\");
    }

    #[test]
    fn extract_does_not_double_an_existing_separator() {
        let plan = extract(
            &tool("UnRAR.exe"),
            r"C:\dl\notes.rar",
            r"C:\dl\out\",
            Overwrite::Skip,
        )
        .expect("plan");
        assert_eq!(plan.args.last().expect("destination"), r"C:\dl\out\");
    }

    #[test]
    fn every_plan_ends_switch_parsing_before_the_first_path() {
        // A file named `-notes.rar` is otherwise read as a switch.
        for plan in [
            extract(
                &tool("UnRAR.exe"),
                "-notes.rar",
                r"C:\out",
                Overwrite::Replace,
            )
            .expect("extract"),
            compress(
                &tool("Rar.exe"),
                "-notes.rar",
                &["-file.txt".into()],
                Compression::Normal,
            )
            .expect("compress"),
            list(&tool("UnRAR.exe"), "-notes.rar").expect("list"),
        ] {
            let end = plan
                .args
                .iter()
                .position(|a| a == END_OF_SWITCHES)
                .expect("the guard is present");
            let first_path = plan
                .args
                .iter()
                .position(|a| a.contains("notes.rar"))
                .expect("the archive is an argument");
            assert!(end < first_path, "{:?}", plan.args);
        }
    }

    #[test]
    fn no_plan_answers_every_prompt_yes() {
        // `-y` would override the caller's Overwrite choice silently.
        let plan =
            extract(&tool("UnRAR.exe"), r"C:\a.rar", r"C:\out", Overwrite::Skip).expect("plan");
        assert!(!plan.args.iter().any(|a| a == "-y"), "{:?}", plan.args);
        assert!(plan.args.iter().any(|a| a == "-o-"), "{:?}", plan.args);
    }

    #[test]
    fn compress_strips_the_base_directory_from_stored_names() {
        // Without -ep1 an archive of C:\Users\mina\src unpacks as
        // Users\mina\src\..., which no "compress this folder" action means.
        let plan = compress(
            &tool("Rar.exe"),
            r"C:\dl\src.rar",
            &[r"C:\dl\src".into()],
            Compression::Normal,
        )
        .expect("plan");
        assert!(plan.args.iter().any(|a| a == "-ep1"), "{:?}", plan.args);
        assert!(plan.args.iter().any(|a| a == "-r"), "{:?}", plan.args);
    }

    #[test]
    fn compress_keeps_every_member_after_the_archive() {
        let members = vec![r"C:\dl\a.txt".to_string(), r"C:\dl\b.txt".to_string()];
        let plan = compress(
            &tool("Rar.exe"),
            r"C:\dl\out.rar",
            &members,
            Compression::Best,
        )
        .expect("plan");
        let archive = plan
            .args
            .iter()
            .position(|a| a == r"C:\dl\out.rar")
            .expect("archive");
        assert_eq!(&plan.args[archive + 1..], &members[..]);
        assert!(plan.args.iter().any(|a| a == "-m5"));
    }

    #[test]
    fn compressing_nothing_is_an_error_rather_than_an_empty_archive() {
        let err = compress(&tool("Rar.exe"), r"C:\a.rar", &[], Compression::Normal)
            .expect_err("empty selection");
        assert!(matches!(err, ArchiveError::NothingToCompress));
    }

    #[test]
    fn one_selected_item_names_the_archive_after_it() {
        assert_eq!(
            archive_name_for(&[r"C:\dl\notes.txt".into()]).expect("name"),
            r"C:\dl\notes.rar"
        );
        // A folder has no extension to replace.
        assert_eq!(
            archive_name_for(&[r"C:\dl\src".into()]).expect("name"),
            r"C:\dl\src.rar"
        );
    }

    #[test]
    fn several_selected_items_are_named_after_their_folder() {
        assert_eq!(
            archive_name_for(&[r"C:\dl\a.txt".into(), r"C:\dl\b.txt".into()]).expect("name"),
            r"C:\dl\dl.rar"
        );
    }

    #[test]
    fn the_archive_lands_beside_the_selection_not_in_the_working_directory() {
        // The shell's working directory is wherever it was launched from; an
        // archive appearing there rather than next to the files would be lost.
        let name = archive_name_for(&[r"C:\Users\mina\Downloads\clip.mp4".into()]).expect("name");
        assert!(name.starts_with(r"C:\Users\mina\Downloads\"), "{name}");
    }
}
