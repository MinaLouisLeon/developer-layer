//! Slots and layouts.
//!
//! A slot is a named region of a monitor's work area with an optional bound
//! application. A layout is the full set of slots for one display set. Layouts
//! are keyed by [`DisplaySet`] so docking and undocking swap arrangements
//! automatically rather than overwriting one another.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::app::AppId;
use crate::geometry::NormalizedRect;
use crate::monitor::{DisplaySet, MonitorId};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct SlotId(pub String);

impl SlotId {
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for SlotId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct Slot {
    pub id: SlotId,
    pub monitor: MonitorId,
    /// Position within the monitor's work area, stored normalised so a
    /// resolution change re-projects rather than invalidating the layout.
    pub bounds: NormalizedRect,
    /// The application that always opens here. `None` makes it a general slot
    /// available to any unassigned window.
    #[serde(default)]
    pub assigned_app: Option<AppId>,
    /// Reserved for the singleton telemetry tile. Exactly one slot per layout
    /// may set this, and it is never released to another application.
    #[serde(default)]
    pub is_telemetry: bool,
}

/// A complete arrangement for one display set.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct SlotLayout {
    pub display_set: DisplaySet,
    pub name: String,
    pub slots: Vec<Slot>,
    /// Gap in physical pixels applied between tiles.
    #[serde(default = "default_gap")]
    pub gap: i32,
}

fn default_gap() -> i32 {
    8
}

impl SlotLayout {
    pub fn new(display_set: DisplaySet, name: impl Into<String>, slots: Vec<Slot>) -> Self {
        Self {
            display_set,
            name: name.into(),
            slots,
            gap: default_gap(),
        }
    }

    pub fn slot(&self, id: &SlotId) -> Option<&Slot> {
        self.slots.iter().find(|s| &s.id == id)
    }

    /// The slot an application is bound to, if any.
    pub fn slot_for_app(&self, app: &AppId) -> Option<&Slot> {
        self.slots
            .iter()
            .find(|s| s.assigned_app.as_ref() == Some(app))
    }

    pub fn telemetry_slot(&self) -> Option<&Slot> {
        self.slots.iter().find(|s| s.is_telemetry)
    }

    pub fn slots_on<'a>(&'a self, monitor: &'a MonitorId) -> impl Iterator<Item = &'a Slot> + 'a {
        self.slots.iter().filter(move |s| &s.monitor == monitor)
    }

    /// Validation errors that would make this layout unusable.
    ///
    /// Run before saving so a broken layout never reaches disk — recovering
    /// from one at startup means the user has no workspace.
    pub fn validate(&self) -> Vec<LayoutError> {
        let mut errors = Vec::new();

        for slot in &self.slots {
            if !slot.bounds.is_valid() {
                errors.push(LayoutError::InvalidBounds(slot.id.clone()));
            }
            if !self.display_set.contains(&slot.monitor) {
                errors.push(LayoutError::UnknownMonitor {
                    slot: slot.id.clone(),
                    monitor: slot.monitor.clone(),
                });
            }
        }

        let mut seen = std::collections::HashSet::new();
        for slot in &self.slots {
            if !seen.insert(&slot.id) {
                errors.push(LayoutError::DuplicateSlotId(slot.id.clone()));
            }
        }

        if self.slots.iter().filter(|s| s.is_telemetry).count() > 1 {
            errors.push(LayoutError::MultipleTelemetrySlots);
        }

        errors
    }
}

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum LayoutError {
    #[error("slot `{0}` has bounds outside its monitor")]
    InvalidBounds(SlotId),
    #[error("slot `{slot}` targets monitor `{monitor}`, which is not in this display set")]
    UnknownMonitor { slot: SlotId, monitor: MonitorId },
    #[error("slot id `{0}` is used more than once")]
    DuplicateSlotId(SlotId),
    #[error("a layout may contain at most one telemetry slot")]
    MultipleTelemetrySlots,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn monitor() -> MonitorId {
        MonitorId::new("dell-u2720q")
    }

    fn slot(id: &str, bounds: NormalizedRect) -> Slot {
        Slot {
            id: SlotId::new(id),
            monitor: monitor(),
            bounds,
            assigned_app: None,
            is_telemetry: false,
        }
    }

    fn layout(slots: Vec<Slot>) -> SlotLayout {
        SlotLayout::new(DisplaySet::new(vec![monitor()]), "Work", slots)
    }

    #[test]
    fn valid_layout_reports_no_errors() {
        let l = layout(vec![
            slot("left", NormalizedRect::new(0.0, 0.0, 0.5, 1.0)),
            slot("right", NormalizedRect::new(0.5, 0.0, 0.5, 1.0)),
        ]);

        assert!(l.validate().is_empty());
    }

    #[test]
    fn rejects_slot_on_a_monitor_not_in_the_display_set() {
        let mut orphan = slot("stray", NormalizedRect::FULL);
        orphan.monitor = MonitorId::new("benq-unplugged");

        let errors = layout(vec![orphan]).validate();

        assert!(errors
            .iter()
            .any(|e| matches!(e, LayoutError::UnknownMonitor { .. })));
    }

    #[test]
    fn rejects_duplicate_slot_ids() {
        let errors = layout(vec![
            slot("main", NormalizedRect::new(0.0, 0.0, 0.5, 1.0)),
            slot("main", NormalizedRect::new(0.5, 0.0, 0.5, 1.0)),
        ])
        .validate();

        assert_eq!(
            errors,
            vec![LayoutError::DuplicateSlotId(SlotId::new("main"))]
        );
    }

    #[test]
    fn rejects_more_than_one_telemetry_slot() {
        let mut a = slot("a", NormalizedRect::new(0.0, 0.0, 0.5, 1.0));
        let mut b = slot("b", NormalizedRect::new(0.5, 0.0, 0.5, 1.0));
        a.is_telemetry = true;
        b.is_telemetry = true;

        let errors = layout(vec![a, b]).validate();

        assert!(errors.contains(&LayoutError::MultipleTelemetrySlots));
    }

    #[test]
    fn finds_the_slot_bound_to_an_app() {
        let mut s = slot("code", NormalizedRect::FULL);
        s.assigned_app = Some(AppId::new("vscode"));

        let l = layout(vec![s]);

        assert_eq!(
            l.slot_for_app(&AppId::new("vscode")).map(|s| s.id.clone()),
            Some(SlotId::new("code"))
        );
        assert!(l.slot_for_app(&AppId::new("slack")).is_none());
    }
}
