//! How to start an application.
//!
//! There are genuinely two mechanisms, not one with a variation. A conventional
//! executable is a process spawn. An MSIX/Store app such as WhatsApp has no
//! launchable executable path at all — the shell must resolve its
//! AppUserModelID — so it is a shell activation. Modelling that as an enum
//! keeps the distinction visible instead of hiding a `shell:` prefix inside a
//! path and hoping.

use std::path::PathBuf;

use dl_core::AppRef;

/// What to actually do to start an application.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LaunchPlan {
    /// Spawn a process directly.
    Process { program: PathBuf, args: Vec<String> },
    /// Ask the shell to activate a target it knows how to resolve.
    ///
    /// Used for packaged apps, and for anything else addressed by a shell verb
    /// rather than a filesystem path.
    ShellActivate { target: String },
}

impl LaunchPlan {
    /// Build a plan from a pinned application's reference.
    pub fn for_app(app_ref: &AppRef) -> Self {
        match app_ref {
            AppRef::Executable { path, args } => Self::Process {
                program: path.clone(),
                args: args.clone(),
            },
            AppRef::Packaged { aumid } => Self::ShellActivate {
                target: format!(r"shell:AppsFolder\{aumid}"),
            },
        }
    }

    /// Whether starting this needs the shell rather than a direct spawn.
    pub fn needs_shell(&self) -> bool {
        matches!(self, Self::ShellActivate { .. })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_executable_becomes_a_process_spawn() {
        let chrome = AppRef::Executable {
            path: PathBuf::from(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
            args: vec!["--new-window".into()],
        };

        assert_eq!(
            LaunchPlan::for_app(&chrome),
            LaunchPlan::Process {
                program: PathBuf::from(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
                args: vec!["--new-window".into()],
            }
        );
    }

    #[test]
    fn a_packaged_app_becomes_a_shell_activation() {
        // WhatsApp has no launchable .exe path; only the shell can resolve it.
        let whatsapp = AppRef::packaged("5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App");

        assert_eq!(
            LaunchPlan::for_app(&whatsapp),
            LaunchPlan::ShellActivate {
                target: r"shell:AppsFolder\5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App".into(),
            }
        );
    }

    #[test]
    fn only_packaged_apps_need_the_shell() {
        assert!(LaunchPlan::for_app(&AppRef::packaged("Some.App!App")).needs_shell());
        assert!(!LaunchPlan::for_app(&AppRef::executable(r"C:\app.exe")).needs_shell());
    }

    #[test]
    fn an_executable_with_no_arguments_carries_an_empty_list() {
        match LaunchPlan::for_app(&AppRef::executable(r"C:\app.exe")) {
            LaunchPlan::Process { args, .. } => assert!(args.is_empty()),
            other => panic!("expected a process spawn, got {other:?}"),
        }
    }
}
