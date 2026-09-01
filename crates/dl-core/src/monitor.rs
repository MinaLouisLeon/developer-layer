//! Display identity.
//!
//! The single most important rule here: `\\.\DISPLAY1` is **not** a stable
//! identifier. Windows reassigns those names across reboots and replugs, so
//! keying layouts to them scrambles the workspace. Identity is derived instead
//! from `QueryDisplayConfig` → `DISPLAYCONFIG_TARGET_DEVICE_NAME.monitorDevicePath`,
//! which carries an EDID-derived instance ID that survives both.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::geometry::Rect;

/// Stable, EDID-derived identity for one physical display.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct MonitorId(pub String);

impl MonitorId {
    pub fn new(device_path: impl Into<String>) -> Self {
        Self(device_path.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for MonitorId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct Monitor {
    pub id: MonitorId,
    /// Human-readable name for the settings UI, e.g. "DELL U2720Q".
    pub name: String,
    /// Full monitor bounds in virtual-desktop coordinates.
    pub bounds: Rect,
    /// Bounds minus anything reserved by an AppBar — this is what slots project onto.
    pub work_area: Rect,
    /// Per-monitor DPI scale. Mixed-DPI setups are why each display gets its
    /// own window rather than one spanning the virtual desktop.
    pub scale_factor: f32,
    pub is_primary: bool,
}

/// The set of displays currently connected, used as the key for a saved layout.
///
/// Order-independent: the same physical monitors always produce the same key
/// regardless of enumeration order, so unplugging and replugging in a different
/// port order still resolves to the same layout.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct DisplaySet(Vec<MonitorId>);

impl DisplaySet {
    pub fn new(mut ids: Vec<MonitorId>) -> Self {
        ids.sort();
        ids.dedup();
        Self(ids)
    }

    pub fn from_monitors(monitors: &[Monitor]) -> Self {
        Self::new(monitors.iter().map(|m| m.id.clone()).collect())
    }

    pub fn ids(&self) -> &[MonitorId] {
        &self.0
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub fn contains(&self, id: &MonitorId) -> bool {
        self.0.iter().any(|m| m == id)
    }

    /// Stable string form, used as the on-disk key for a saved layout.
    pub fn storage_key(&self) -> String {
        self.0
            .iter()
            .map(|id| id.as_str())
            .collect::<Vec<_>>()
            .join("+")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn id(s: &str) -> MonitorId {
        MonitorId::new(s)
    }

    #[test]
    fn display_set_is_order_independent() {
        let a = DisplaySet::new(vec![id("laptop"), id("dell"), id("benq")]);
        let b = DisplaySet::new(vec![id("benq"), id("laptop"), id("dell")]);

        assert_eq!(
            a, b,
            "replugging in a different port order must resolve to the same layout"
        );
        assert_eq!(a.storage_key(), b.storage_key());
    }

    #[test]
    fn display_set_deduplicates() {
        let set = DisplaySet::new(vec![id("dell"), id("dell")]);
        assert_eq!(set.len(), 1);
    }

    #[test]
    fn docked_and_undocked_sets_are_distinct() {
        let docked = DisplaySet::new(vec![id("laptop"), id("dell"), id("benq")]);
        let undocked = DisplaySet::new(vec![id("laptop")]);

        assert_ne!(docked, undocked);
        assert!(docked.contains(&id("laptop")));
        assert!(!undocked.contains(&id("dell")));
    }
}
