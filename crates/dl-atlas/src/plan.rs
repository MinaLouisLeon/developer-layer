//! Turning an invocation into the effect that carries it out.
//!
//! This is the seam. The command bar produces an invocation from a click; in
//! phase 09 a model produces one from a tool call. Both arrive here, and both
//! are validated against the same live snapshot, so the Tauri layer downstream
//! is a `match` with no decisions in it.
//!
//! Deciding here rather than there also means the interesting question —
//! *what does "open Chrome" mean when Chrome is already open?* — is answered
//! once, in a test, instead of twice in two call sites.

use dl_core::{AppId, DockEntry, WindowId};

use crate::action;
use crate::invocation::{Arg, Invocation};
use crate::palette::Context;
use crate::AtlasError;

/// One of Developer Layer's own windows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Surface {
    Shell,
    Workbench,
}

/// What running an invocation does. Every variant maps to one call the desktop
/// layer already knows how to make.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Effect {
    LaunchApp(AppId),
    FocusWindow(WindowId),
    MinimizeWindow(WindowId),
    /// Every window of an application that is entirely in the dock.
    RestoreWindows(Vec<WindowId>),
    Retile,
    SyncDisplays,
    SaveLayout,
    EditLayout,
    SetTaskbarReplacement(bool),
    Open(Surface),
    Quit,
}

/// Resolve `invocation` against the current workspace.
pub fn plan(invocation: &Invocation, context: &Context<'_>) -> Result<Effect, AtlasError> {
    match (invocation.action, &invocation.arg) {
        (action::LAYOUT_RETILE, _) => Ok(Effect::Retile),
        (action::LAYOUT_SAVE, _) => Ok(Effect::SaveLayout),
        (action::LAYOUT_EDIT, _) => Ok(Effect::EditLayout),
        (action::DISPLAY_SYNC, _) => Ok(Effect::SyncDisplays),
        (action::SURFACE_SHELL, _) => Ok(Effect::Open(Surface::Shell)),
        (action::SURFACE_WORKBENCH, _) => Ok(Effect::Open(Surface::Workbench)),
        (action::SHELL_QUIT, _) => Ok(Effect::Quit),

        (action::TASKBAR_REPLACE, Some(Arg::Flag(hidden))) => {
            Ok(Effect::SetTaskbarReplacement(*hidden))
        }
        (action::APP_OPEN, Some(Arg::App(app))) => open_app(app, context),
        (action::WINDOW_FOCUS, Some(Arg::Window(window))) => {
            require_window(*window, context).map(Effect::FocusWindow)
        }
        (action::WINDOW_MINIMIZE, Some(Arg::Window(window))) => {
            require_window(*window, context).map(Effect::MinimizeWindow)
        }

        // Reachable from a key built against one action and parsed against
        // another after a rename, and from a model in phase 09.
        (id, arg) => Err(AtlasError::BadArgument {
            expected: "an argument matching the action's parameter",
            got: format!("{id} with {arg:?}"),
        }),
    }
}

/// What "open" means depends on what the application is already doing.
///
/// Deliberately **not** the dock's click semantics. A dock click on the
/// focused app minimises it, because clicking a thing that is already in front
/// otherwise looks like a dead click. Choosing "Focus Chrome" from a command
/// bar and having Chrome disappear would be the opposite of what was asked
/// for, so this never minimises.
fn open_app(app: &AppId, context: &Context<'_>) -> Result<Effect, AtlasError> {
    let Some(entry) = running_entry(app, context.dock) else {
        return Ok(Effect::LaunchApp(app.clone()));
    };

    if entry.fully_minimized() {
        return Ok(Effect::RestoreWindows(
            entry.windows.iter().map(|w| w.id).collect(),
        ));
    }

    // The first window that is actually on screen. Restoring one from the dock
    // when another is already visible would move a window the user did not
    // name.
    entry
        .windows
        .iter()
        .find(|w| !w.minimized)
        .map(|w| Effect::FocusWindow(w.id))
        .ok_or(AtlasError::NothingToDo {
            what: "that application has no window to focus",
        })
}

fn running_entry<'a>(app: &AppId, dock: &'a [DockEntry]) -> Option<&'a DockEntry> {
    dock.iter()
        .find(|e| e.app.as_ref() == Some(app) && e.is_running())
}

/// Refuse a window that has closed since the palette was built.
///
/// The alternative is asking the platform to focus a handle Windows has
/// already recycled, which can land on somebody else's window.
fn require_window(window: WindowId, context: &Context<'_>) -> Result<WindowId, AtlasError> {
    let known = context
        .dock
        .iter()
        .flat_map(|e| e.windows.iter())
        .any(|w| w.id == window);

    if known {
        Ok(window)
    } else {
        Err(AtlasError::WindowGone(window))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::action::{APP_OPEN, TASKBAR_REPLACE, WINDOW_FOCUS, WINDOW_MINIMIZE};
    use dl_core::{AppRef, DockWindow, PinnedApp};

    fn window(id: u64, minimized: bool) -> DockWindow {
        DockWindow {
            id: WindowId(id),
            title: format!("window {id}"),
            minimized,
        }
    }

    fn entry(app: &str, windows: Vec<DockWindow>) -> DockEntry {
        DockEntry {
            app: Some(AppId::new(app)),
            display_name: app.into(),
            pinned: true,
            windows,
            active: false,
        }
    }

    fn ctx<'a>(dock: &'a [DockEntry], installed: &'a [PinnedApp]) -> Context<'a> {
        Context {
            installed,
            dock,
            taskbar_hidden: false,
        }
    }

    fn open(app: &str, dock: &[DockEntry]) -> Effect {
        plan(
            &Invocation::with(APP_OPEN, Arg::App(AppId::new(app))),
            &ctx(dock, &[]),
        )
        .expect("a plan")
    }

    #[test]
    fn opening_an_application_that_is_not_running_launches_it() {
        assert_eq!(open("chrome", &[]), Effect::LaunchApp(AppId::new("chrome")));
    }

    #[test]
    fn opening_a_running_application_focuses_a_window_that_is_on_screen() {
        let dock = vec![entry("chrome", vec![window(1, true), window(2, false)])];
        // Not window 1: restoring one from the dock while another is already
        // visible moves a window the user did not name.
        assert_eq!(open("chrome", &dock), Effect::FocusWindow(WindowId(2)));
    }

    #[test]
    fn opening_a_fully_minimised_application_restores_all_of_its_windows() {
        let dock = vec![entry("slack", vec![window(1, true), window(2, true)])];
        assert_eq!(
            open("slack", &dock),
            Effect::RestoreWindows(vec![WindowId(1), WindowId(2)])
        );
    }

    #[test]
    fn opening_the_focused_application_never_minimises_it() {
        // A dock click does, deliberately — re-focusing something already
        // focused looks like a dead click. Choosing "Focus Chrome" from a
        // command bar and watching Chrome vanish is the opposite of the ask.
        let mut dock = vec![entry("chrome", vec![window(1, false)])];
        dock[0].active = true;

        assert_eq!(open("chrome", &dock), Effect::FocusWindow(WindowId(1)));
    }

    #[test]
    fn an_application_with_no_windows_at_all_launches_rather_than_failing() {
        // `is_running` is false for an entry with an empty window list, which
        // is a pinned app that is simply not started.
        let dock = vec![entry("code", vec![])];
        assert_eq!(open("code", &dock), Effect::LaunchApp(AppId::new("code")));
    }

    #[test]
    fn a_window_that_closed_since_the_palette_was_built_is_refused() {
        // Windows recycles handles. Focusing a stale one can land on somebody
        // else's window, so a missing window is an error rather than a no-op.
        let dock = vec![entry("chrome", vec![window(1, false)])];
        let err = plan(
            &Invocation::with(WINDOW_FOCUS, Arg::Window(WindowId(99))),
            &ctx(&dock, &[]),
        )
        .expect_err("gone");
        assert!(
            matches!(err, AtlasError::WindowGone(WindowId(99))),
            "{err:?}"
        );
    }

    #[test]
    fn focusing_and_minimising_reach_the_window_that_was_named() {
        let dock = vec![entry("chrome", vec![window(1, false), window(2, false)])];
        assert_eq!(
            plan(
                &Invocation::with(WINDOW_FOCUS, Arg::Window(WindowId(2))),
                &ctx(&dock, &[])
            ),
            Ok(Effect::FocusWindow(WindowId(2)))
        );
        assert_eq!(
            plan(
                &Invocation::with(WINDOW_MINIMIZE, Arg::Window(WindowId(1))),
                &ctx(&dock, &[])
            ),
            Ok(Effect::MinimizeWindow(WindowId(1)))
        );
    }

    #[test]
    fn a_flag_is_carried_through_in_both_directions() {
        // The palette only offers the direction that changes something, but
        // plan accepts either, so a phase-09 tool call can set it idempotently.
        for hidden in [true, false] {
            assert_eq!(
                plan(
                    &Invocation::with(TASKBAR_REPLACE, Arg::Flag(hidden)),
                    &ctx(&[], &[])
                ),
                Ok(Effect::SetTaskbarReplacement(hidden))
            );
        }
    }

    #[test]
    fn every_action_in_the_registry_can_be_planned() {
        // A registry entry with no arm here is a row the bar shows and then
        // refuses to run. This is what stops one being added without the other.
        let installed = vec![PinnedApp {
            id: AppId::new("chrome"),
            display_name: "Chrome".into(),
            app_ref: AppRef::executable(r"C:\chrome.exe"),
            icon_key: None,
            always_float: false,
        }];
        let dock = vec![entry("chrome", vec![window(1, false)])];
        let context = ctx(&dock, &installed);

        let entries = crate::palette::build(&context);
        for action in action::ACTIONS {
            assert!(
                entries.iter().any(|e| e.invocation.action == action.id),
                "{} produced no entry",
                action.id
            );
        }
        for entry in &entries {
            plan(&entry.invocation, &context).unwrap_or_else(|e| panic!("{}: {e}", entry.label));
        }
    }
}
