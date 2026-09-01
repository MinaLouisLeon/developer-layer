//! Where the daily applications actually live.
//!
//! They do not install alike, and assuming they do is how a dock ends up with
//! half its icons broken:
//!
//! - **Chrome, VS Code, Postman** register under the registry's `App Paths`
//!   key, which is the closest thing Windows has to a canonical lookup.
//! - **Slack** is Squirrel-packaged: an `Update.exe` stub beside versioned
//!   `app-x.y.z` directories that change on every update.
//! - **ClickUp** is a plain Electron install under `%LOCALAPPDATA%\Programs`.
//! - **WhatsApp** is MSIX with *no launchable executable path at all*; only its
//!   AppUserModelID works.
//! - **File Explorer** is the shell itself, always present, never searched for.
//!
//! Each entry lists strategies in priority order. Discovery walks them until
//! one resolves, so a user who installed Chrome somewhere unusual still gets a
//! working dock entry from a later strategy.

use std::path::PathBuf;

use dl_core::{AppId, AppRef};

/// One way to locate an application.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Strategy {
    /// Look up `HKLM/HKCU\...\App Paths\<exe>`.
    AppPaths { exe: &'static str },
    /// A Squirrel install root relative to `%LOCALAPPDATA%`, newest version.
    Squirrel {
        local_app_data_dir: &'static str,
        exe: &'static str,
    },
    /// A fixed path relative to a known folder.
    Relative {
        base: KnownFolder,
        rest: &'static str,
    },
    /// An MSIX package, addressed by the prefix of its AppUserModelID.
    ///
    /// A prefix rather than a literal because the package family name embeds a
    /// publisher hash that differs between Store and sideloaded installs.
    Packaged { aumid_prefix: &'static str },
    /// Always available as part of the shell.
    ShellBuiltin { path: &'static str },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KnownFolder {
    LocalAppData,
    ProgramFiles,
    ProgramFilesX86,
    Windows,
}

impl KnownFolder {
    /// Resolve from the environment. `None` when the variable is unset, which
    /// on Windows means something is badly wrong but is routine in tests.
    pub fn path(self) -> Option<PathBuf> {
        let var = match self {
            Self::LocalAppData => "LOCALAPPDATA",
            Self::ProgramFiles => "ProgramFiles",
            Self::ProgramFilesX86 => "ProgramFiles(x86)",
            Self::Windows => "SystemRoot",
        };
        std::env::var_os(var).map(PathBuf::from)
    }
}

/// A known application and how to find it.
#[derive(Debug, Clone)]
pub struct KnownApp {
    pub id: &'static str,
    pub display_name: &'static str,
    /// Tried in order until one resolves.
    pub strategies: &'static [Strategy],
    /// Applications that fight `SetWindowPos` or are dialog-shaped.
    pub always_float: bool,
}

impl KnownApp {
    pub fn app_id(&self) -> AppId {
        AppId::new(self.id)
    }
}

/// The seven daily applications.
///
/// WinRAR is deliberately absent: archive handling lives in the file tree as
/// extract and compress actions driven by `rar.exe`, not as a dock entry.
pub const KNOWN_APPS: &[KnownApp] = &[
    KnownApp {
        id: "vscode",
        display_name: "VS Code",
        strategies: &[
            Strategy::AppPaths { exe: "Code.exe" },
            Strategy::Relative {
                base: KnownFolder::LocalAppData,
                rest: r"Programs\Microsoft VS Code\Code.exe",
            },
            Strategy::Relative {
                base: KnownFolder::ProgramFiles,
                rest: r"Microsoft VS Code\Code.exe",
            },
        ],
        always_float: false,
    },
    KnownApp {
        id: "chrome",
        display_name: "Chrome",
        strategies: &[
            Strategy::AppPaths { exe: "chrome.exe" },
            Strategy::Relative {
                base: KnownFolder::ProgramFiles,
                rest: r"Google\Chrome\Application\chrome.exe",
            },
            Strategy::Relative {
                base: KnownFolder::ProgramFilesX86,
                rest: r"Google\Chrome\Application\chrome.exe",
            },
        ],
        always_float: false,
    },
    KnownApp {
        id: "postman",
        display_name: "Postman",
        strategies: &[
            Strategy::AppPaths { exe: "Postman.exe" },
            // Postman is Squirrel-packaged too, though it also registers a path.
            Strategy::Squirrel {
                local_app_data_dir: "Postman",
                exe: "Postman.exe",
            },
        ],
        always_float: false,
    },
    KnownApp {
        id: "slack",
        display_name: "Slack",
        strategies: &[
            // Squirrel first: App Paths can point at a version Squirrel has
            // since removed, whereas the version directories are the truth.
            Strategy::Squirrel {
                local_app_data_dir: "slack",
                exe: "slack.exe",
            },
            Strategy::AppPaths { exe: "slack.exe" },
            Strategy::Packaged {
                aumid_prefix: "91750D7E.Slack",
            },
        ],
        always_float: false,
    },
    KnownApp {
        id: "clickup",
        display_name: "ClickUp",
        strategies: &[
            Strategy::Relative {
                base: KnownFolder::LocalAppData,
                rest: r"Programs\ClickUp\ClickUp.exe",
            },
            Strategy::AppPaths { exe: "ClickUp.exe" },
        ],
        always_float: false,
    },
    KnownApp {
        id: "whatsapp",
        display_name: "WhatsApp",
        // MSIX only. There is no executable path that works.
        strategies: &[Strategy::Packaged {
            aumid_prefix: "5319275A.WhatsAppDesktop",
        }],
        always_float: false,
    },
    KnownApp {
        id: "explorer",
        display_name: "File Explorer",
        strategies: &[Strategy::ShellBuiltin {
            path: r"explorer.exe",
        }],
        always_float: false,
    },
];

pub fn known(id: &str) -> Option<&'static KnownApp> {
    KNOWN_APPS.iter().find(|a| a.id == id)
}

/// A resolved application, ready to pin.
#[derive(Debug, Clone, PartialEq)]
pub struct Resolved {
    pub id: AppId,
    pub display_name: String,
    pub app_ref: AppRef,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_daily_application_is_present() {
        for id in [
            "vscode", "chrome", "postman", "slack", "clickup", "whatsapp", "explorer",
        ] {
            assert!(known(id).is_some(), "{id} missing from the catalog");
        }
    }

    #[test]
    fn winrar_is_deliberately_not_a_dock_entry() {
        // Archive handling lives in the file tree; a dock icon was explicitly
        // ruled out.
        assert!(known("winrar").is_none());
    }

    #[test]
    fn whatsapp_offers_no_executable_strategy() {
        // An MSIX app has no launchable path; offering one would produce an
        // entry that silently fails to start.
        let whatsapp = known("whatsapp").expect("present");

        assert!(whatsapp
            .strategies
            .iter()
            .all(|s| matches!(s, Strategy::Packaged { .. })));
    }

    #[test]
    fn slack_prefers_squirrel_over_the_registry() {
        // App Paths can point at a version Squirrel has already deleted; the
        // version directories are the ground truth.
        let slack = known("slack").expect("present");

        assert!(matches!(
            slack.strategies.first(),
            Some(Strategy::Squirrel { .. })
        ));
    }

    #[test]
    fn every_app_lists_at_least_one_strategy() {
        for app in KNOWN_APPS {
            assert!(
                !app.strategies.is_empty(),
                "{} has no way to be found",
                app.id
            );
        }
    }

    #[test]
    fn catalog_ids_are_unique() {
        let mut ids: Vec<&str> = KNOWN_APPS.iter().map(|a| a.id).collect();
        ids.sort_unstable();
        let before = ids.len();
        ids.dedup();

        assert_eq!(
            before,
            ids.len(),
            "duplicate id would shadow a slot binding"
        );
    }

    #[test]
    fn apps_that_can_move_offer_a_fallback() {
        // Anything resolved only through a single fixed path breaks the moment
        // the user installs it elsewhere.
        for app in KNOWN_APPS {
            let single_fixed_path =
                app.strategies.len() == 1 && matches!(app.strategies[0], Strategy::Relative { .. });

            assert!(
                !single_fixed_path,
                "{} would break on a non-default install location",
                app.id
            );
        }
    }
}
