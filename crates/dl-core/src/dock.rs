//! Dock entry types.
//!
//! The types live here because they cross IPC and need `ts-rs`; the rules that
//! build and interpret them live in `dl-wm::dock`, which stays free of any
//! serialisation concern.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::app::AppId;
use crate::window::WindowId;

/// One window as the dock sees it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct DockWindow {
    pub id: WindowId,
    pub title: String,
    pub minimized: bool,
}

/// One entry in the dock.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct DockEntry {
    /// `None` for a running application that is not pinned.
    pub app: Option<AppId>,
    pub display_name: String,
    pub pinned: bool,
    pub windows: Vec<DockWindow>,
    /// Whether one of this entry's windows currently holds the foreground.
    pub active: bool,
}

impl DockEntry {
    pub fn is_running(&self) -> bool {
        !self.windows.is_empty()
    }

    pub fn window_count(&self) -> usize {
        self.windows.len()
    }

    /// Windows sitting in the dock rather than on screen.
    pub fn minimized_count(&self) -> usize {
        self.windows.iter().filter(|w| w.minimized).count()
    }

    /// Whether every window of this app is minimised.
    ///
    /// Distinct from "not running": the entry shows as running, but nothing is
    /// visible, so a click should restore rather than minimise.
    pub fn fully_minimized(&self) -> bool {
        self.is_running() && self.windows.iter().all(|w| w.minimized)
    }
}

/// What a click on a dock entry should do.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", tag = "kind", content = "value")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub enum DockAction {
    /// Nothing is running — start it.
    Launch(AppId),
    /// Bring this window forward.
    Focus(WindowId),
    /// It is focused and visible; put it away.
    Minimize(WindowId),
    /// Every window is minimised; bring them all back.
    RestoreAll(Vec<WindowId>),
    /// Several windows and none focused — move to the next one.
    Cycle(WindowId),
    /// A pinned entry that is not running and has no app to launch.
    Nothing,
}
