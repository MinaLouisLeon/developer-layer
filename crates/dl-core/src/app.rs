//! Application identity and launch strategy.
//!
//! The eight daily applications do not all launch the same way. Chrome, VS Code
//! and Postman resolve through the registry's `App Paths` key. Slack is
//! Squirrel-packaged under `%LOCALAPPDATA%`. ClickUp is Electron. WhatsApp is an
//! MSIX Store app with **no launchable executable path at all** — it opens only
//! through `shell:AppsFolder\<AUMID>`. `AppRef` makes that distinction explicit
//! rather than assuming every app is a path.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Stable identifier for a pinned application, used to bind it to a slot.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct AppId(pub String);

impl AppId {
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for AppId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

/// How to launch an application, and how to recognise its windows later.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub enum AppRef {
    /// A conventional executable. Windows are matched by process image path.
    #[serde(rename_all = "camelCase")]
    Executable {
        path: PathBuf,
        #[serde(default)]
        args: Vec<String>,
    },
    /// An MSIX/Store application, launchable only by AppUserModelID.
    /// Windows are matched by `GetApplicationUserModelId` on the owning process.
    #[serde(rename_all = "camelCase")]
    Packaged { aumid: String },
}

impl AppRef {
    pub fn executable(path: impl Into<PathBuf>) -> Self {
        Self::Executable {
            path: path.into(),
            args: Vec::new(),
        }
    }

    pub fn packaged(aumid: impl Into<String>) -> Self {
        Self::Packaged {
            aumid: aumid.into(),
        }
    }

    /// Packaged apps cannot be started by path; the shell must resolve the AUMID.
    pub fn requires_shell_activation(&self) -> bool {
        matches!(self, Self::Packaged { .. })
    }
}

/// An application pinned to the dock, optionally bound to a slot.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct PinnedApp {
    pub id: AppId,
    pub display_name: String,
    pub app_ref: AppRef,
    /// Key into the on-disk icon cache; icons are extracted once and reused.
    #[serde(default)]
    pub icon_key: Option<String>,
    /// Windows matching this app always float instead of tiling. Set for
    /// applications that fight `SetWindowPos` or are dialog-shaped.
    #[serde(default)]
    pub always_float: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packaged_apps_need_shell_activation() {
        // WhatsApp has no .exe path — this is the case that breaks naive docks.
        let whatsapp = AppRef::packaged("5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App");
        assert!(whatsapp.requires_shell_activation());

        let chrome = AppRef::executable(r"C:\Program Files\Google\Chrome\Application\chrome.exe");
        assert!(!chrome.requires_shell_activation());
    }

    #[test]
    fn app_ref_round_trips_through_json() {
        let cases = vec![
            AppRef::packaged("5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App"),
            AppRef::Executable {
                path: PathBuf::from(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
                args: vec!["--incognito".into()],
            },
        ];

        for case in cases {
            let json = serde_json::to_string(&case).expect("serialise");
            let back: AppRef = serde_json::from_str(&json).expect("deserialise");
            assert_eq!(case, back);
        }
    }

    #[test]
    fn executable_args_default_to_empty_when_absent() {
        let json = r#"{"kind":"executable","path":"C:\\bin\\app.exe"}"#;
        let parsed: AppRef = serde_json::from_str(json).expect("deserialise");

        assert_eq!(parsed, AppRef::executable(r"C:\bin\app.exe"));
    }
}
