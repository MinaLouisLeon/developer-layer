//! Turning the registry into the list a query is matched against.
//!
//! An action is a description; a palette entry is a thing that can be run.
//! Expansion is the step between, and it is pure over a snapshot of the
//! workspace, so every rule below is a test rather than something you find out
//! by opening the bar.
//!
//! Two rules shape it. Expansion covers **at most one** parameter, because two
//! collection parameters is the cartesian product of every app and every
//! window. And an entry is only produced when running it would *change*
//! something: offering "Minimise" for a window already in the dock, or "Hide
//! the taskbar" when it is already hidden, is a row the user has to read past
//! every time to reach one that does something.

use dl_core::{AppId, DockEntry, PinnedApp, WindowId};

use crate::action::{self, Action, Category, ParamKind};
use crate::invocation::{Arg, Invocation};

/// The snapshot a palette is built from.
pub struct Context<'a> {
    /// Applications this machine has, running or not.
    pub installed: &'a [PinnedApp],
    /// The dock's view: pinned apps, anything else running, and their windows.
    pub dock: &'a [DockEntry],
    /// Whether the native taskbar is currently hidden.
    pub taskbar_hidden: bool,
}

/// One runnable row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    pub invocation: Invocation,
    pub label: String,
    pub detail: String,
    pub category: Category,
    /// What the query is matched against. Wider than the label on purpose —
    /// see [`Entry::new`].
    pub haystack: String,
}

impl Entry {
    fn new(
        action: &Action,
        invocation: Invocation,
        label: impl Into<String>,
        detail: impl Into<String>,
    ) -> Self {
        let label = label.into();
        // The label alone is not enough. An application already running reads
        // "Focus Chrome", and somebody typing "open chrome" means exactly that
        // row — so the action's keywords ride along in the text being matched
        // but not in the text being shown.
        let haystack = format!("{label} {}", action.keywords.join(" "));
        Self {
            invocation,
            label,
            detail: detail.into(),
            category: action.category,
            haystack,
        }
    }

    pub fn key(&self) -> String {
        self.invocation.key()
    }
}

/// Build every entry worth showing for this snapshot.
pub fn build(context: &Context<'_>) -> Vec<Entry> {
    action::ACTIONS
        .iter()
        .flat_map(|action| expand(action, context))
        .collect()
}

/// Expand one action over the snapshot.
pub fn expand(action: &'static Action, context: &Context<'_>) -> Vec<Entry> {
    let Some(param) = action.param() else {
        return vec![Entry::new(
            action,
            Invocation::bare(action.id),
            action.title,
            action.summary,
        )];
    };

    match param.kind {
        ParamKind::App => apps(action, context),
        ParamKind::Window => windows(action, context),
        ParamKind::Flag => flag(action, context),
    }
}

/// One row per installed application, labelled by what opening it would do.
///
/// The verb is the honest one for the app's current state rather than a
/// uniform "Open": a user scanning the list learns whether Slack is already
/// running from the row itself.
fn apps(action: &'static Action, context: &Context<'_>) -> Vec<Entry> {
    context
        .installed
        .iter()
        .map(|app| {
            let state = app_state(&app.id, context.dock);
            let (verb, detail) = match state {
                AppState::NotRunning => ("Open", "Not running".to_string()),
                AppState::AllMinimized(n) => ("Restore", minimized_detail(n)),
                AppState::Running(n) => ("Focus", running_detail(n)),
            };
            Entry::new(
                action,
                Invocation::with(action.id, Arg::App(app.id.clone())),
                format!("{verb} {}", app.display_name),
                detail,
            )
        })
        .collect()
}

fn minimized_detail(n: usize) -> String {
    if n == 1 {
        "Minimised".into()
    } else {
        format!("{n} windows, all minimised")
    }
}

fn running_detail(n: usize) -> String {
    if n == 1 {
        "Running".into()
    } else {
        format!("Running — {n} windows")
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AppState {
    NotRunning,
    /// Running, but every window is in the dock.
    AllMinimized(usize),
    Running(usize),
}

fn app_state(app: &AppId, dock: &[DockEntry]) -> AppState {
    let Some(entry) = dock.iter().find(|e| e.app.as_ref() == Some(app)) else {
        return AppState::NotRunning;
    };
    if !entry.is_running() {
        AppState::NotRunning
    } else if entry.fully_minimized() {
        AppState::AllMinimized(entry.window_count())
    } else {
        AppState::Running(entry.window_count())
    }
}

/// One row per open window, skipping the ones the action could not change.
///
/// Focusing covers minimised windows — that is how you get one back. Minimising
/// does not: a window already in the dock cannot go there again, and the row
/// would do nothing.
fn windows(action: &'static Action, context: &Context<'_>) -> Vec<Entry> {
    let minimise = action.id == action::WINDOW_MINIMIZE;

    context
        .dock
        .iter()
        .flat_map(|entry| {
            entry.windows.iter().filter_map(move |window| {
                if minimise && window.minimized {
                    return None;
                }
                let verb = if minimise {
                    "Minimise"
                } else if window.minimized {
                    "Restore"
                } else {
                    "Focus"
                };
                Some(Entry::new(
                    action,
                    Invocation::with(action.id, Arg::Window(WindowId(window.id.0))),
                    format!("{verb} {}", window_name(window, entry)),
                    entry.display_name.clone(),
                ))
            })
        })
        .collect()
}

/// A window's title, falling back to its application's name.
///
/// An untitled window is common — a splash screen, a window mid-launch — and
/// a row reading "Focus " with nothing after it is unusable.
fn window_name(window: &dl_core::DockWindow, entry: &DockEntry) -> String {
    let title = window.title.trim();
    if title.is_empty() {
        entry.display_name.clone()
    } else {
        title.to_string()
    }
}

/// A flag offers only the value that is not already set.
fn flag(action: &'static Action, context: &Context<'_>) -> Vec<Entry> {
    let target = !context.taskbar_hidden;
    let (label, detail) = if target {
        (
            "Hide the Windows taskbar",
            "Use the Developer Layer dock instead.",
        )
    } else {
        (
            "Restore the Windows taskbar",
            "Put the native taskbar back.",
        )
    };
    vec![Entry::new(
        action,
        Invocation::with(action.id, Arg::Flag(target)),
        label,
        detail,
    )]
}

#[cfg(test)]
mod tests {
    use super::*;
    use dl_core::{AppRef, DockWindow};

    fn app(id: &str, name: &str) -> PinnedApp {
        PinnedApp {
            id: AppId::new(id),
            display_name: name.into(),
            app_ref: AppRef::executable(format!(r"C:\{id}.exe")),
            icon_key: None,
            always_float: false,
        }
    }

    fn window(id: u64, title: &str, minimized: bool) -> DockWindow {
        DockWindow {
            id: WindowId(id),
            title: title.into(),
            minimized,
        }
    }

    fn dock_entry(app_id: Option<&str>, name: &str, windows: Vec<DockWindow>) -> DockEntry {
        DockEntry {
            app: app_id.map(AppId::new),
            display_name: name.into(),
            pinned: app_id.is_some(),
            windows,
            active: false,
        }
    }

    fn context<'a>(installed: &'a [PinnedApp], dock: &'a [DockEntry]) -> Context<'a> {
        Context {
            installed,
            dock,
            taskbar_hidden: false,
        }
    }

    fn labels(entries: &[Entry]) -> Vec<&str> {
        entries.iter().map(|e| e.label.as_str()).collect()
    }

    #[test]
    fn an_action_without_a_parameter_produces_exactly_one_entry() {
        let entries = expand(
            action::find(action::LAYOUT_RETILE).expect("action"),
            &context(&[], &[]),
        );
        assert_eq!(labels(&entries), vec!["Re-tile the workspace"]);
        assert_eq!(entries[0].key(), "layout.retile");
    }

    #[test]
    fn the_verb_says_what_opening_the_app_would_actually_do() {
        // Scanning the list should tell you whether Slack is already running.
        let installed = vec![
            app("chrome", "Chrome"),
            app("slack", "Slack"),
            app("code", "VS Code"),
        ];
        let dock = vec![
            dock_entry(Some("chrome"), "Chrome", vec![window(1, "Docs", false)]),
            dock_entry(Some("slack"), "Slack", vec![window(2, "Slack", true)]),
        ];
        let entries = expand(
            action::find(action::APP_OPEN).expect("action"),
            &context(&installed, &dock),
        );

        assert_eq!(
            labels(&entries),
            vec!["Focus Chrome", "Restore Slack", "Open VS Code"]
        );
    }

    #[test]
    fn open_still_matches_an_app_that_is_already_running() {
        // The row says "Focus Chrome", but somebody typing "open chrome" means
        // that row. The keywords are in the haystack and not in the label.
        let installed = vec![app("chrome", "Chrome")];
        let dock = vec![dock_entry(
            Some("chrome"),
            "Chrome",
            vec![window(1, "Docs", false)],
        )];
        let entries = expand(
            action::find(action::APP_OPEN).expect("action"),
            &context(&installed, &dock),
        );

        assert_eq!(entries[0].label, "Focus Chrome");
        assert!(
            entries[0].haystack.contains("open"),
            "{}",
            entries[0].haystack
        );
        assert!(
            entries[0].haystack.contains("launch"),
            "{}",
            entries[0].haystack
        );
    }

    #[test]
    fn minimising_is_not_offered_for_a_window_already_in_the_dock() {
        // The row would do nothing, and it would sit between the rows that do.
        let dock = vec![dock_entry(
            Some("slack"),
            "Slack",
            vec![window(1, "General", false), window(2, "Threads", true)],
        )];
        let entries = expand(
            action::find(action::WINDOW_MINIMIZE).expect("action"),
            &context(&[], &dock),
        );
        assert_eq!(labels(&entries), vec!["Minimise General"]);
    }

    #[test]
    fn focusing_is_offered_for_a_minimised_window_because_that_is_how_it_returns() {
        let dock = vec![dock_entry(
            Some("slack"),
            "Slack",
            vec![window(1, "General", false), window(2, "Threads", true)],
        )];
        let entries = expand(
            action::find(action::WINDOW_FOCUS).expect("action"),
            &context(&[], &dock),
        );
        assert_eq!(labels(&entries), vec!["Focus General", "Restore Threads"]);
    }

    #[test]
    fn an_untitled_window_borrows_its_application_name() {
        // A row reading "Focus " with nothing after it cannot be chosen with
        // any confidence.
        let dock = vec![dock_entry(
            Some("code"),
            "VS Code",
            vec![window(1, "   ", false)],
        )];
        let entries = expand(
            action::find(action::WINDOW_FOCUS).expect("action"),
            &context(&[], &dock),
        );
        assert_eq!(labels(&entries), vec!["Focus VS Code"]);
    }

    #[test]
    fn a_flag_offers_only_the_value_that_is_not_already_set() {
        let taskbar = action::find(action::TASKBAR_REPLACE).expect("action");

        let shown = Context {
            installed: &[],
            dock: &[],
            taskbar_hidden: false,
        };
        let entries = expand(taskbar, &shown);
        assert_eq!(labels(&entries), vec!["Hide the Windows taskbar"]);
        assert_eq!(entries[0].key(), "taskbar.replace:on");

        let hidden = Context {
            installed: &[],
            dock: &[],
            taskbar_hidden: true,
        };
        let entries = expand(taskbar, &hidden);
        assert_eq!(labels(&entries), vec!["Restore the Windows taskbar"]);
        assert_eq!(entries[0].key(), "taskbar.replace:off");
    }

    #[test]
    fn every_key_a_palette_produces_parses_back() {
        // The UI hands keys back and they are re-validated. A key the palette
        // can emit but the parser rejects is a row that cannot be run.
        let installed = vec![app("chrome", "Chrome")];
        let dock = vec![dock_entry(
            Some("chrome"),
            "Chrome",
            vec![window(7, "Docs", false)],
        )];
        let entries = build(&context(&installed, &dock));

        assert!(entries.len() > action::ACTIONS.len() - 3);
        for entry in &entries {
            let parsed = Invocation::parse(&entry.key()).expect(&entry.label);
            assert_eq!(parsed, entry.invocation);
        }
    }

    #[test]
    fn an_empty_workspace_still_offers_every_action_that_needs_nothing() {
        // Nothing installed and nothing running is the state at first launch.
        // A command bar that is empty then is a command bar that looks broken.
        let entries = build(&context(&[], &[]));
        assert!(entries.iter().any(|e| e.key() == "display.sync"));
        assert!(entries.iter().any(|e| e.key() == "shell.quit"));
        assert!(!entries.is_empty());
    }
}
