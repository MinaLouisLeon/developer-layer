//! Window records tracked by the slot engine.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::app::AppId;
use crate::monitor::MonitorId;
use crate::slot::SlotId;

/// Opaque handle to a managed window. On Windows this wraps an `HWND`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct WindowId(pub u64);

/// Why a window is currently minimised.
///
/// This distinction drives the reconnect rule and cannot be inferred after the
/// fact. When a display is unplugged its orphaned windows minimise with
/// [`MinimizeReason::DisplayDisconnect`]; on reconnect exactly those windows are
/// restored. A window the user minimised themselves before undocking stays
/// minimised, because its reason is [`MinimizeReason::User`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub enum MinimizeReason {
    /// The user minimised it deliberately. Never auto-restored.
    User,
    /// Its display was disconnected and no slot was available. Restored when
    /// the display set changes back.
    DisplayDisconnect,
}

/// How a window participates in the grid.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub enum TileMode {
    /// Occupies a slot in the no-overlap grid.
    Tiled,
    /// Exempt from tiling. Owned popups, modal dialogs, file pickers and
    /// installers are floated by rule — applying a strict grid to them breaks
    /// the host application outright.
    Floating,
    /// Temporarily fullscreen via the escape hatch. Tiling is suspended and
    /// overlays hide until it exits.
    Fullscreen,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct WindowRecord {
    pub id: WindowId,
    /// Resolved owning application, when one could be matched.
    pub app_id: Option<AppId>,
    pub title: String,
    pub monitor: Option<MonitorId>,
    pub slot: Option<SlotId>,
    pub tile_mode: TileMode,
    /// `None` when the window is visible.
    pub minimized: Option<MinimizeReason>,
}

impl WindowRecord {
    pub fn is_minimized(&self) -> bool {
        self.minimized.is_some()
    }

    /// Whether reconnecting a display should bring this window back.
    pub fn should_restore_on_reconnect(&self) -> bool {
        self.minimized == Some(MinimizeReason::DisplayDisconnect)
    }

    /// Whether this window competes for space in the grid right now.
    pub fn occupies_a_slot(&self) -> bool {
        !self.is_minimized() && matches!(self.tile_mode, TileMode::Tiled)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn window(minimized: Option<MinimizeReason>) -> WindowRecord {
        WindowRecord {
            id: WindowId(1),
            app_id: Some(AppId::new("slack")),
            title: "Slack".into(),
            monitor: None,
            slot: None,
            tile_mode: TileMode::Tiled,
            minimized,
        }
    }

    #[test]
    fn only_disconnect_orphans_are_restored() {
        assert!(window(Some(MinimizeReason::DisplayDisconnect)).should_restore_on_reconnect());

        // The case this field exists for: you minimised Slack yourself before
        // undocking, so docking again must not resurrect it.
        assert!(!window(Some(MinimizeReason::User)).should_restore_on_reconnect());
        assert!(!window(None).should_restore_on_reconnect());
    }

    #[test]
    fn minimized_and_floating_windows_free_their_slot() {
        assert!(window(None).occupies_a_slot());
        assert!(!window(Some(MinimizeReason::User)).occupies_a_slot());

        let mut floating = window(None);
        floating.tile_mode = TileMode::Floating;
        assert!(!floating.occupies_a_slot());
    }
}
