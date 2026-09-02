//! Starting Developer Layer at logon, with elevation.
//!
//! A scheduled task rather than a `Run` registry key or a Startup shortcut,
//! and the reason is elevation: managing windows owned by an elevated process
//! requires being elevated, and neither of the other two can ask for it. A
//! task registered with `/RL HIGHEST` runs elevated at logon without a UAC
//! prompt every morning, which is the only arrangement a shell replacement can
//! actually live with.
//!
//! `schtasks` rather than the COM Task Scheduler API: the whole interaction is
//! three commands, the argument rules are the only thing that can be wrong,
//! and as arguments they are testable on any machine.

use std::path::Path;
use std::process::Command;

/// The task's name in the scheduler. Also what a user looks for when they want
/// to remove it by hand, so it is the product's name and not an identifier.
pub const TASK_NAME: &str = "Developer Layer";

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum AutostartError {
    #[error("registering the logon task needs administrator rights")]
    NeedsElevation,
    #[error("schtasks could not be run: {0}")]
    Unavailable(String),
    #[error("schtasks refused: {0}")]
    Refused(String),
    #[error("not supported on this platform: {0}")]
    Unsupported(&'static str),
}

pub type Result<T> = std::result::Result<T, AutostartError>;

/// Arguments that register the logon task.
///
/// `/TR` is the trap. `schtasks` parses that value itself rather than taking it
/// as one opaque argument, so a path containing a space — which
/// `C:\Program Files\...` always does — has to carry its own quotes *inside*
/// the value. Without them the task registers happily and then fails at logon,
/// having tried to run `C:\Program`.
pub fn register_args(executable: &Path) -> Vec<String> {
    vec![
        "/Create".into(),
        "/TN".into(),
        TASK_NAME.into(),
        "/TR".into(),
        format!("\"{}\"", executable.display()),
        "/SC".into(),
        "ONLOGON".into(),
        // Elevated, which is the point.
        "/RL".into(),
        "HIGHEST".into(),
        // Overwrite an existing task rather than failing. Re-registering after
        // moving the executable is the common case, and an error there would
        // leave the old, now-wrong path in place.
        "/F".into(),
    ]
}

pub fn unregister_args() -> Vec<String> {
    vec![
        "/Delete".into(),
        "/TN".into(),
        TASK_NAME.into(),
        "/F".into(),
    ]
}

pub fn query_args() -> Vec<String> {
    vec!["/Query".into(), "/TN".into(), TASK_NAME.into()]
}

/// Whether the logon task exists.
///
/// A missing task and a `schtasks` that cannot run are both "no": the setting
/// is a convenience, and a settings screen that refuses to render because a
/// query failed would be worse than one showing the switch off.
pub fn is_registered() -> bool {
    run(query_args()).is_ok()
}

/// Register or remove the logon task.
pub fn set_enabled(enabled: bool, executable: &Path) -> Result<()> {
    if !cfg!(windows) {
        return Err(AutostartError::Unsupported(
            "the logon task is a Windows scheduled task",
        ));
    }

    if enabled {
        run(register_args(executable)).map(|_| ())
    } else {
        // Removing a task that is not there is success, not failure — it is
        // the state the caller asked for.
        match run(unregister_args()) {
            Ok(_) | Err(AutostartError::Refused(_)) => Ok(()),
            Err(e) => Err(e),
        }
    }
}

fn run(args: Vec<String>) -> Result<String> {
    let output = Command::new("schtasks")
        .args(&args)
        .output()
        .map_err(|e| AutostartError::Unavailable(e.to_string()))?;

    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }

    let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(classify(&message))
}

/// Turn `schtasks`'s message into something actionable.
///
/// Access denied is the one worth telling apart: it means the shell is not
/// elevated, which is a thing the user can do something about, and it is by
/// far the most likely failure since `/RL HIGHEST` requires it.
pub fn classify(message: &str) -> AutostartError {
    let lower = message.to_lowercase();
    if lower.contains("access is denied") || lower.contains("5)") || lower.contains("denied") {
        AutostartError::NeedsElevation
    } else if message.is_empty() {
        AutostartError::Refused("schtasks failed without saying why".into())
    } else {
        AutostartError::Refused(message.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn args_for(path: &str) -> Vec<String> {
        register_args(&PathBuf::from(path))
    }

    #[test]
    fn the_executable_path_carries_its_own_quotes() {
        // The rule this module exists for. `schtasks` parses /TR itself, so a
        // path with a space registers fine and then fails at logon having
        // tried to run `C:\Program`. Every real install path has a space in it.
        let args = args_for(r"C:\Program Files\Developer Layer\dl-desktop.exe");
        let tr = args
            .iter()
            .position(|a| a == "/TR")
            .map(|i| &args[i + 1])
            .expect("/TR is present");

        assert!(tr.starts_with('"') && tr.ends_with('"'), "{tr}");
        assert!(tr.contains("Program Files"), "{tr}");
    }

    #[test]
    fn the_task_runs_elevated_at_logon() {
        // Both are the point of using a scheduled task at all: without
        // HIGHEST, tiling silently skips every window owned by an elevated
        // process, which on a developer's machine is most of the interesting
        // ones.
        let args = args_for(r"C:\dl.exe");
        assert!(args.windows(2).any(|w| w == ["/SC", "ONLOGON"]), "{args:?}");
        assert!(args.windows(2).any(|w| w == ["/RL", "HIGHEST"]), "{args:?}");
    }

    #[test]
    fn registering_again_replaces_rather_than_fails() {
        // Re-registering after the executable moved is the common case, and
        // failing would leave the old, now-wrong path in the scheduler.
        assert!(args_for(r"C:\dl.exe").contains(&"/F".to_string()));
    }

    #[test]
    fn every_command_names_the_same_task() {
        // Three commands that disagreed would register one task and query
        // another, so the switch would never look on.
        for args in [args_for(r"C:\dl.exe"), unregister_args(), query_args()] {
            let name = args
                .iter()
                .position(|a| a == "/TN")
                .map(|i| args[i + 1].clone())
                .expect("/TN is present");
            assert_eq!(name, TASK_NAME);
        }
    }

    #[test]
    fn access_denied_is_reported_as_needing_elevation() {
        // The most likely failure by far, since /RL HIGHEST requires it, and
        // the only one the user can act on.
        assert_eq!(
            classify("ERROR: Access is denied."),
            AutostartError::NeedsElevation
        );
        assert!(matches!(
            classify("ERROR: The system cannot find the file specified."),
            AutostartError::Refused(_)
        ));
    }

    #[test]
    fn a_silent_failure_still_says_something() {
        // schtasks does occasionally fail with an empty stderr, and
        // "schtasks refused: " with nothing after it helps nobody.
        assert!(matches!(
            classify("   "),
            AutostartError::Refused(m) if !m.is_empty()
        ));
    }

    #[test]
    #[cfg(not(windows))]
    fn off_windows_it_refuses_rather_than_pretending() {
        let err = set_enabled(true, &PathBuf::from("/dl")).expect_err("unsupported");
        assert!(matches!(err, AutostartError::Unsupported(_)));
    }
}
