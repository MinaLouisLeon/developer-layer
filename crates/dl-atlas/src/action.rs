//! The typed action registry.
//!
//! Every action Atlas can perform is declared once, here. The command bar
//! reads this in phase 07; LM Studio tool-calling reads the same declarations
//! in phase 09. Declaring them twice is what turns adding an LLM into a
//! rewrite of the action layer, which is the whole reason this is a registry
//! rather than a `match` in the command bar.
//!
//! An action is a *description*, never a closure. It carries no behaviour, so
//! it can be serialised to a tool schema, listed in a settings screen and
//! matched against a query without any of those touching the shell.

use serde::{Deserialize, Serialize};

/// A stable identifier, in `noun.verb` form.
///
/// Stable is the operative word: it is written into the recents file and will
/// be written into an LLM tool schema, so renaming one is a migration.
///
/// It borrows from the registry, so it serialises but cannot be deserialised.
/// That is the right way round: an id arriving from outside has to be looked
/// up in [`ACTIONS`] to mean anything, which is what
/// [`crate::Invocation::parse`] does.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
pub struct ActionId(pub &'static str);

impl ActionId {
    pub fn as_str(self) -> &'static str {
        self.0
    }
}

impl std::fmt::Display for ActionId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.0)
    }
}

/// What a parameter accepts.
///
/// The variants are deliberately domain types rather than strings. `App` does
/// not mean "a string naming an app", it means "one of the applications this
/// machine actually has" — which is what lets the command bar expand an action
/// into one entry per app, and what will let phase 09 hand the model a closed
/// set of valid values instead of hoping it invents a real one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ParamKind {
    /// An installed application.
    App,
    /// An open window.
    Window,
    /// On or off. Expands to both, so "hide" and "restore" are each findable
    /// by name rather than one being a hidden toggle of the other.
    Flag,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Param {
    pub name: &'static str,
    pub kind: ParamKind,
    pub summary: &'static str,
}

/// Where an action shows up, and how it sorts when scores tie.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Category {
    /// Opening and focusing applications — what a command bar is opened for
    /// most of the time, so it sorts first on a tie.
    Application,
    Window,
    Layout,
    Display,
    Shell,
}

impl Category {
    pub fn label(self) -> &'static str {
        match self {
            Category::Application => "Application",
            Category::Window => "Window",
            Category::Layout => "Layout",
            Category::Display => "Display",
            Category::Shell => "Shell",
        }
    }
}

/// Whether an action needs an explicit yes before it runs.
///
/// The distinction is about how the invocation was *arrived at*, not only what
/// it does. Choosing a row in the command bar is already an explicit yes — the
/// user read the label and pressed Enter. Voice and, in phase 09, a model both
/// **infer** an invocation from a phrase, and an inference can be wrong in a
/// way a click cannot. So a risky action asks once when it was inferred, and
/// runs straight away when it was chosen.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Risk {
    /// Reversible, or cheap enough that asking would be noise.
    Safe,
    /// Ask first when inferred. Reserved for what cannot be undone by doing it
    /// again — not merely for what is significant.
    Confirm,
}

#[derive(Debug, Clone, Copy)]
pub struct Action {
    pub id: ActionId,
    /// Shown when the action takes no parameter. A parameterised action builds
    /// its own label per entry, because "Open — Chrome" reads better than
    /// "Open application" with Chrome hidden in a subtitle.
    pub title: &'static str,
    /// One sentence. Doubles as the tool description in phase 09, which is why
    /// it says what the action does rather than restating its name.
    pub summary: &'static str,
    pub category: Category,
    /// Whether an inferred invocation of this action asks first.
    pub risk: Risk,
    /// At most one, in this phase. See `palette::expand`.
    pub params: &'static [Param],
    /// Extra words a query may match. Terms a user would plausibly type that
    /// do not appear in the title — British and American spellings, and the
    /// name of the thing in Windows rather than the name we give it.
    pub keywords: &'static [&'static str],
}

impl Action {
    pub fn param(&self) -> Option<&Param> {
        self.params.first()
    }

    pub fn needs_confirmation(&self) -> bool {
        self.risk == Risk::Confirm
    }
}

const NO_PARAMS: &[Param] = &[];

pub const APP_OPEN: ActionId = ActionId("app.open");
pub const WINDOW_FOCUS: ActionId = ActionId("window.focus");
pub const WINDOW_MINIMIZE: ActionId = ActionId("window.minimize");
pub const LAYOUT_RETILE: ActionId = ActionId("layout.retile");
pub const LAYOUT_SAVE: ActionId = ActionId("layout.save");
pub const LAYOUT_EDIT: ActionId = ActionId("layout.edit");
pub const DISPLAY_SYNC: ActionId = ActionId("display.sync");
pub const TASKBAR_REPLACE: ActionId = ActionId("taskbar.replace");
pub const SURFACE_SHELL: ActionId = ActionId("surface.shell");
pub const SURFACE_WORKBENCH: ActionId = ActionId("surface.workbench");
pub const SHELL_QUIT: ActionId = ActionId("shell.quit");

/// Every action Atlas knows.
pub const ACTIONS: &[Action] = &[
    Action {
        id: APP_OPEN,
        title: "Open application",
        summary: "Open an application, or bring it to the front if it is already running.",
        category: Category::Application,
        risk: Risk::Safe,
        params: &[Param {
            name: "app",
            kind: ParamKind::App,
            summary: "The application to open.",
        }],
        // "open" is here as well as in the title, because a running
        // application's row reads "Focus Chrome" — and somebody typing
        // "open chrome" means that row.
        keywords: &["open", "launch", "start", "run", "focus", "switch"],
    },
    Action {
        id: WINDOW_FOCUS,
        title: "Focus window",
        summary: "Bring one open window to the front.",
        category: Category::Window,
        risk: Risk::Safe,
        params: &[Param {
            name: "window",
            kind: ParamKind::Window,
            summary: "The window to focus.",
        }],
        keywords: &["switch", "activate", "raise"],
    },
    Action {
        id: WINDOW_MINIMIZE,
        title: "Minimise window",
        summary: "Send one window to the dock.",
        category: Category::Window,
        risk: Risk::Safe,
        params: &[Param {
            name: "window",
            kind: ParamKind::Window,
            summary: "The window to minimise.",
        }],
        keywords: &["minimize", "hide", "dock"],
    },
    Action {
        id: LAYOUT_RETILE,
        title: "Re-tile the workspace",
        summary: "Run a tiling pass now, putting every window back in its slot.",
        category: Category::Layout,
        risk: Risk::Safe,
        params: NO_PARAMS,
        keywords: &["tile", "arrange", "fix", "reset windows"],
    },
    Action {
        id: LAYOUT_SAVE,
        title: "Save this layout",
        summary: "Keep the current arrangement for this set of displays.",
        category: Category::Layout,
        // Overwrites the arrangement saved for these displays, but the current
        // one is on screen to look at first, and saving again re-does it.
        risk: Risk::Safe,
        params: NO_PARAMS,
        keywords: &["store", "keep", "remember"],
    },
    Action {
        id: LAYOUT_EDIT,
        title: "Edit the layout",
        summary: "Open edit mode, where slot borders can be dragged.",
        category: Category::Layout,
        risk: Risk::Safe,
        params: NO_PARAMS,
        keywords: &["slots", "borders", "resize", "split"],
    },
    Action {
        id: DISPLAY_SYNC,
        title: "Re-detect displays",
        summary: "Look at the connected displays again and pick the layout for them.",
        category: Category::Display,
        risk: Risk::Safe,
        params: NO_PARAMS,
        keywords: &["monitors", "screens", "rescan", "refresh"],
    },
    Action {
        id: TASKBAR_REPLACE,
        title: "Windows taskbar",
        summary: "Hide the native Windows taskbar and use the dock instead, or put it back.",
        category: Category::Shell,
        // Significant, but not irreversible: four routes put the taskbar back,
        // and asking every time would make the one people use daily annoying.
        risk: Risk::Safe,
        params: &[Param {
            name: "hidden",
            kind: ParamKind::Flag,
            summary: "Whether the native taskbar is hidden.",
        }],
        keywords: &["tray", "shell_traywnd", "start bar"],
    },
    Action {
        id: SURFACE_SHELL,
        title: "Open Developer Layer",
        summary: "Bring the Developer Layer window to the front.",
        category: Category::Shell,
        risk: Risk::Safe,
        params: NO_PARAMS,
        keywords: &["settings", "dock", "telemetry", "preferences"],
    },
    Action {
        id: SURFACE_WORKBENCH,
        title: "Open the workbench",
        summary: "Bring the mino workbench to the front.",
        category: Category::Shell,
        risk: Risk::Safe,
        params: NO_PARAMS,
        keywords: &["mino", "terminal", "nushell", "editor", "files", "git"],
    },
    Action {
        id: SHELL_QUIT,
        title: "Quit Developer Layer",
        summary: "Restore the native taskbar and exit.",
        category: Category::Shell,
        // The one that cannot be undone by doing it again. A misheard phrase
        // must not take the user's whole shell down with the dock and the
        // taskbar mid-work.
        risk: Risk::Confirm,
        params: NO_PARAMS,
        keywords: &["exit", "close", "shut down"],
    },
];

pub fn find(id: ActionId) -> Option<&'static Action> {
    ACTIONS.iter().find(|a| a.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn every_action_id_is_unique() {
        // Two actions sharing an id would make `find` return whichever came
        // first, silently running the wrong one — and a recents entry or a
        // phase-09 tool call would be ambiguous.
        let mut seen = HashSet::new();
        for action in ACTIONS {
            assert!(seen.insert(action.id), "duplicate id {}", action.id);
        }
    }

    #[test]
    fn no_action_declares_more_than_one_parameter() {
        // `palette::expand` produces the cartesian product otherwise, and two
        // collection parameters over apps and windows is thousands of entries.
        // When a second parameter is genuinely needed it needs slot filling,
        // which is phase 09's job, not a quiet change here.
        for action in ACTIONS {
            assert!(
                action.params.len() <= 1,
                "{} has {:?}",
                action.id,
                action.params
            );
        }
    }

    #[test]
    fn every_action_id_reads_as_noun_dot_verb() {
        // The ids go into a tool schema and a persisted recents file. A
        // consistent shape is what keeps them greppable and stable.
        for action in ACTIONS {
            let id = action.id.as_str();
            assert_eq!(id.split('.').count(), 2, "{id}");
            assert!(
                id.chars().all(|c| c.is_ascii_lowercase() || c == '.'),
                "{id}"
            );
        }
    }

    #[test]
    fn every_summary_is_a_sentence_because_a_model_will_read_it() {
        // In phase 09 these become tool descriptions. A fragment that merely
        // restates the title tells the model nothing it did not have.
        for action in ACTIONS {
            assert!(action.summary.ends_with('.'), "{}", action.id);
            assert!(action.summary.len() > action.title.len(), "{}", action.id);
        }
    }

    #[test]
    fn confirmation_is_reserved_for_what_cannot_be_undone() {
        // A long list of "are you sure?" is a list people learn to dismiss
        // without reading, which is worse than no confirmation at all. The bar
        // is: doing it again does not undo it.
        let confirming: Vec<_> = ACTIONS
            .iter()
            .filter(|a| a.needs_confirmation())
            .map(|a| a.id.as_str())
            .collect();

        assert_eq!(confirming, ["shell.quit"]);
    }

    #[test]
    fn find_returns_the_named_action() {
        assert_eq!(find(APP_OPEN).expect("app.open").title, "Open application");
        assert!(find(ActionId("nope.nothing")).is_none());
    }
}
