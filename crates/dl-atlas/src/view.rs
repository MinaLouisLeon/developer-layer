//! The shape a ranked row crosses IPC in.
//!
//! Separate from [`crate::search::Hit`], which borrows from the palette and
//! carries a score the command bar has no use for. This is what the UI draws,
//! and it lives here rather than in the Tauri layer for the reason every
//! domain type does: `apps/desktop` cannot generate TypeScript on Linux, so a
//! type declared there is a type CI cannot check for drift.

use serde::Serialize;
use ts_rs::TS;

use crate::search::Hit;

/// One row of the command bar.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct AtlasHit {
    /// The invocation, in the form `atlas_run` takes back.
    ///
    /// The UI hands this back rather than an index into the list it was shown.
    /// It is re-parsed and re-validated against a fresh snapshot, so a key from
    /// a palette built a minute ago cannot run whatever now sits at that
    /// position.
    pub key: String,
    pub label: String,
    pub detail: String,
    /// The category's display name, for the group heading.
    pub category: String,
}

impl From<&Hit<'_>> for AtlasHit {
    fn from(hit: &Hit<'_>) -> Self {
        Self {
            key: hit.entry.key(),
            label: hit.entry.label.clone(),
            detail: hit.entry.detail.clone(),
            category: hit.entry.category.label().to_string(),
        }
    }
}

/// Rank the palette and render it for the UI.
pub fn search(entries: &[crate::Entry], query: &str, recents: &crate::Recents) -> Vec<AtlasHit> {
    crate::search::rank(entries, query, recents)
        .iter()
        .map(AtlasHit::from)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::palette::{self, Context};
    use crate::Recents;
    use dl_core::{AppId, AppRef, PinnedApp};

    #[test]
    fn a_rendered_row_carries_a_key_that_can_be_run() {
        // The whole contract with the UI: what it is given back is enough to
        // run the row, and nothing else is.
        let installed = vec![PinnedApp {
            id: AppId::new("chrome"),
            display_name: "Chrome".into(),
            app_ref: AppRef::executable(r"C:\chrome.exe"),
            icon_key: None,
            always_float: false,
        }];
        let entries = palette::build(&Context {
            installed: &installed,
            dock: &[],
            taskbar_hidden: false,
        });

        let rows = search(&entries, "chrome", &Recents::default());
        let first = rows.first().expect("a row");

        assert_eq!(first.label, "Open Chrome");
        assert_eq!(first.category, "Application");
        assert!(crate::Invocation::parse(&first.key).is_ok());
    }
}
