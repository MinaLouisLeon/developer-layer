//! The taskbar restore guarantee.
//!
//! Hiding `Shell_TrayWnd` is the single most destructive thing this project
//! does. If the process dies while the taskbar is hidden, the user is left with
//! no taskbar, no dock, and no obvious way back — on the machine they work on.
//!
//! So restoration is not "handled on exit". It is guaranteed through four
//! independent routes, each covering a failure the others miss:
//!
//! | Route | Covers |
//! | --- | --- |
//! | Normal shutdown | A clean exit |
//! | Panic hook | A Rust panic unwinding the process |
//! | Unhandled exception filter | An access violation or other hard fault |
//! | Guardian process | `TerminateProcess`, a power loss on resume, anything that runs no code in this process at all |
//!
//! Only the guardian survives the last case, which is why it is a separate
//! process rather than another hook. This module holds the *state machine* —
//! pure, so the rules are tested — while `dl-platform-win` performs the actual
//! window operations.
//!
//! `panic = "abort"` is deliberately absent from the release profile so the
//! panic hook runs.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// Whether the native taskbar is currently hidden by us.
///
/// Shared with the panic hook and exception filter, which run on threads that
/// cannot take a lock safely — an `AtomicBool` is the only thing those contexts
/// can read without risking a deadlock during a crash.
#[derive(Debug, Clone, Default)]
pub struct TaskbarState {
    hidden: Arc<AtomicBool>,
}

impl TaskbarState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_hidden(&self) -> bool {
        self.hidden.load(Ordering::SeqCst)
    }

    pub fn mark_hidden(&self) {
        self.hidden.store(true, Ordering::SeqCst);
    }

    pub fn mark_restored(&self) {
        self.hidden.store(false, Ordering::SeqCst);
    }

    /// Whether a restore is needed right now.
    ///
    /// Every recovery route calls this before acting, so restoring twice —
    /// which happens routinely, since a panic runs the hook *and* the guard's
    /// drop — is a no-op rather than a second `ShowWindow` fighting the shell.
    pub fn needs_restore(&self) -> bool {
        self.is_hidden()
    }
}

/// Why a restore is being attempted. Recorded so logs explain which safety net
/// actually caught a failure — the one that fires is the one worth trusting.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RestoreReason {
    /// The user turned taskbar replacement off, or the app is shutting down.
    Normal,
    /// A Rust panic is unwinding.
    Panic,
    /// A hard fault reached the unhandled exception filter.
    Exception,
    /// The user pressed the restore hotkey.
    Hotkey,
    /// The guardian noticed the parent process died.
    Guardian,
}

impl RestoreReason {
    /// Whether this route indicates the shell is in an unexpected state.
    ///
    /// Anything but a normal shutdown means replacement should stay off until
    /// the user asks again: silently re-hiding after a crash would loop them
    /// straight back into the failure.
    pub fn is_failure(&self) -> bool {
        !matches!(self, Self::Normal)
    }
}

/// What the caller should do about taskbar replacement on the next start.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NextStart {
    /// Replacement is on and behaved; hide again.
    HideAgain,
    /// The previous run ended badly. Leave the native taskbar alone and tell
    /// the user why, rather than reproducing the crash on every launch.
    StayVisible,
}

/// Decide whether to hide the taskbar on startup.
///
/// `replacement_enabled` is the user's setting; `clean_shutdown` is whether the
/// previous run recorded a normal exit.
pub fn next_start(replacement_enabled: bool, clean_shutdown: bool) -> NextStart {
    if replacement_enabled && clean_shutdown {
        NextStart::HideAgain
    } else {
        NextStart::StayVisible
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_fresh_state_reports_nothing_to_restore() {
        assert!(!TaskbarState::new().needs_restore());
    }

    #[test]
    fn hiding_then_restoring_returns_to_no_work() {
        let state = TaskbarState::new();

        state.mark_hidden();
        assert!(state.needs_restore());

        state.mark_restored();
        assert!(!state.needs_restore());
    }

    #[test]
    fn a_second_restore_is_a_no_op() {
        // A panic runs the hook *and* the guard's drop; the second must not
        // issue another ShowWindow that fights the shell.
        let state = TaskbarState::new();
        state.mark_hidden();

        state.mark_restored();
        assert!(!state.needs_restore());
        state.mark_restored();
        assert!(!state.needs_restore());
    }

    #[test]
    fn state_is_shared_across_clones() {
        // The panic hook holds a clone; it must see what the main path did.
        let state = TaskbarState::new();
        let hook_copy = state.clone();

        state.mark_hidden();

        assert!(hook_copy.needs_restore());
    }

    #[test]
    fn only_a_normal_shutdown_is_not_a_failure() {
        assert!(!RestoreReason::Normal.is_failure());

        for reason in [
            RestoreReason::Panic,
            RestoreReason::Exception,
            RestoreReason::Hotkey,
            RestoreReason::Guardian,
        ] {
            assert!(reason.is_failure(), "{reason:?} should count as a failure");
        }
    }

    #[test]
    fn a_clean_previous_run_hides_again() {
        assert_eq!(next_start(true, true), NextStart::HideAgain);
    }

    #[test]
    fn a_crash_leaves_the_native_taskbar_alone_next_time() {
        // Re-hiding after a crash would loop the user straight back into the
        // failure, with no taskbar to escape through.
        assert_eq!(next_start(true, false), NextStart::StayVisible);
    }

    #[test]
    fn replacement_disabled_never_hides() {
        assert_eq!(next_start(false, true), NextStart::StayVisible);
        assert_eq!(next_start(false, false), NextStart::StayVisible);
    }
}
