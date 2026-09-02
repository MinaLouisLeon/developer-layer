//! Running a [`Plan`] and reading what the tool said.
//!
//! The only part of this crate that touches a process. Everything it decides —
//! which exit code means what — is pure and tested; the spawn itself is not.

use std::process::Command;

use crate::plan::Plan;
use crate::{ArchiveError, Result};

/// What a finished archive operation produced.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct ArchiveOutcome {
    /// The archive written, or the directory extracted into.
    pub path: String,
    /// True when the tool reported a non-fatal warning: it did the work, but
    /// something was skipped. Surfaced rather than swallowed, because the
    /// usual cause is a file that was open and could not be read.
    pub warnings: bool,
}

/// Translate a RAR exit code.
///
/// The codes are shared by `Rar.exe` and `UnRAR.exe` and documented in their
/// manuals. Mapping every one of them by hand is worth it: the alternative is
/// "the archiver failed (7)", which tells a user nothing and tells the next
/// maintainer less.
pub fn interpret(code: i32) -> Result<bool> {
    match code {
        0 => Ok(false),
        // The work was done; something in it was skipped.
        1 => Ok(true),
        2 => Err(ArchiveError::Failed("a fatal error occurred".into())),
        3 => Err(ArchiveError::Failed(
            "the archive is corrupt: a checksum did not match".into(),
        )),
        4 => Err(ArchiveError::Failed("the archive is locked".into())),
        5 => Err(ArchiveError::Failed(
            "the destination could not be written to".into(),
        )),
        6 => Err(ArchiveError::Failed(
            "the archive could not be opened".into(),
        )),
        // A bad command line is ours, not the user's — plan construction is
        // the only thing that writes one.
        7 => Err(ArchiveError::Failed(
            "the archiver rejected the command line, which is a bug in Developer Layer".into(),
        )),
        8 => Err(ArchiveError::Failed(
            "the archiver ran out of memory".into(),
        )),
        9 => Err(ArchiveError::Failed(
            "the archive file could not be created".into(),
        )),
        10 => Err(ArchiveError::NoMatchingFiles),
        11 => Err(ArchiveError::PasswordRequired),
        255 => Err(ArchiveError::Failed("the operation was cancelled".into())),
        other => Err(ArchiveError::Failed(format!(
            "the archiver exited with an unrecognised code ({other})"
        ))),
    }
}

/// Run a plan to completion and interpret its exit code.
///
/// Returns whether the tool warned. `outcome_path` is what the caller wants
/// reported back — the archive it built, or the folder it filled.
pub fn run(plan: &Plan, outcome_path: impl Into<String>) -> Result<ArchiveOutcome> {
    let mut command = Command::new(&plan.program);
    command.args(&plan.args);
    no_window(&mut command);

    tracing::debug!(program = ?plan.program, args = ?plan.args, "running an archive plan");

    let status = command.status().map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => ArchiveError::WinRarNotFound,
        _ => ArchiveError::Failed(format!("the archiver could not be started: {e}")),
    })?;

    let code = status.code().ok_or_else(|| {
        ArchiveError::Failed("the archiver was terminated before it finished".into())
    })?;

    Ok(ArchiveOutcome {
        path: outcome_path.into(),
        warnings: interpret(code)?,
    })
}

/// Keep the console tool from flashing a window.
///
/// `Rar.exe` is a console application, so Windows gives it one. A black
/// rectangle appearing over a tiled workspace for the length of an extraction
/// is exactly the GUI the locked decision rules out.
#[cfg(windows)]
fn no_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn no_window(_command: &mut Command) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn success_is_not_a_warning_and_a_warning_is_not_a_failure() {
        assert!(!interpret(0).expect("success"));
        // Code 1 means the archive exists and one member was skipped. Treating
        // it as failure would tell the user nothing was written when something
        // was.
        assert!(interpret(1).expect("warning"));
    }

    #[test]
    fn a_wrong_password_is_its_own_error_rather_than_a_generic_failure() {
        // The UI can only offer to ask for a password if it can tell.
        assert!(matches!(interpret(11), Err(ArchiveError::PasswordRequired)));
    }

    #[test]
    fn no_matching_files_is_distinguishable_from_a_broken_archive() {
        assert!(matches!(interpret(10), Err(ArchiveError::NoMatchingFiles)));
        assert!(matches!(interpret(3), Err(ArchiveError::Failed(_))));
    }

    #[test]
    fn every_documented_code_has_a_message_of_its_own() {
        let mut seen = std::collections::HashSet::new();
        for code in [2, 3, 4, 5, 6, 7, 8, 9, 255] {
            let message = interpret(code).expect_err("a failure").to_string();
            assert!(seen.insert(message.clone()), "duplicate for {code}");
        }
    }

    #[test]
    fn an_undocumented_code_still_names_itself() {
        // A future RAR version's new code must not be reported as success.
        let message = interpret(42).expect_err("a failure").to_string();
        assert!(message.contains("42"), "{message}");
    }
}
