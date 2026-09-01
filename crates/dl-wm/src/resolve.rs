//! Placement resolution: deciding which window belongs in which slot, and how
//! empty slots collapse.

use std::collections::{HashMap, HashSet};

use dl_core::{
    Monitor, MonitorId, NormalizedRect, Rect, Slot, SlotId, SlotLayout, WindowId, WindowRecord,
};

/// Floating-point tolerance for edge adjacency in normalised space.
/// Slots are authored by dragging, so exact equality never holds.
const EPS: f32 = 0.001;

fn close(a: f32, b: f32) -> bool {
    (a - b).abs() < EPS
}

/// A resolved window position, ready for the platform layer to apply.
#[derive(Debug, Clone, PartialEq)]
pub struct Placement {
    pub window: WindowId,
    pub slot: SlotId,
    /// Physical bounds with the layout gap already applied.
    pub bounds: Rect,
}

/// Resolves windows onto a layout.
pub struct Resolver<'a> {
    layout: &'a SlotLayout,
    monitors: HashMap<MonitorId, &'a Monitor>,
}

impl<'a> Resolver<'a> {
    pub fn new(layout: &'a SlotLayout, monitors: &'a [Monitor]) -> Self {
        Self {
            layout,
            monitors: monitors.iter().map(|m| (m.id.clone(), m)).collect(),
        }
    }

    /// Resolve every tiled, non-minimised window to a slot and physical rect.
    ///
    /// Windows that cannot be placed are simply absent from the result; the
    /// caller minimises them. Returning them as "unplaced" and letting the
    /// caller forget to handle it is how windows end up stranded offscreen.
    pub fn resolve(&self, windows: &[WindowRecord]) -> Vec<Placement> {
        let candidates: Vec<&WindowRecord> =
            windows.iter().filter(|w| w.occupies_a_slot()).collect();

        let assignments = self.assign_slots(&candidates);

        let occupied: HashSet<SlotId> = assignments.values().cloned().collect();
        let effective = self.collapse_empty_slots(&occupied);

        let mut placements: Vec<Placement> = assignments
            .into_iter()
            .filter_map(|(window, slot_id)| {
                let slot = self.layout.slot(&slot_id)?;
                let monitor = self.monitors.get(&slot.monitor)?;
                let bounds = effective
                    .get(&slot_id)
                    .copied()
                    .unwrap_or(slot.bounds)
                    .project(&monitor.work_area)
                    .inset(self.layout.gap);

                Some(Placement {
                    window,
                    slot: slot_id,
                    bounds,
                })
            })
            .collect();

        placements.sort_by_key(|p| p.window);
        placements
    }

    /// Windows that could not be given a slot. These minimise to the dock.
    pub fn unplaceable(&self, windows: &[WindowRecord]) -> Vec<WindowId> {
        let candidates: Vec<&WindowRecord> =
            windows.iter().filter(|w| w.occupies_a_slot()).collect();
        let assigned = self.assign_slots(&candidates);

        let mut ids: Vec<WindowId> = candidates
            .iter()
            .map(|w| w.id)
            .filter(|id| !assigned.contains_key(id))
            .collect();
        ids.sort();
        ids
    }

    fn assign_slots(&self, windows: &[&WindowRecord]) -> HashMap<WindowId, SlotId> {
        let mut taken: HashSet<SlotId> = HashSet::new();
        let mut result = HashMap::new();
        let mut leftovers = Vec::new();

        // Pass 1: windows whose app owns a slot go there, so the workspace is
        // identical every morning regardless of launch order.
        for window in windows {
            let assigned = window
                .app_id
                .as_ref()
                .and_then(|app| self.layout.slot_for_app(app))
                .filter(|slot| !taken.contains(&slot.id));

            match assigned {
                Some(slot) => {
                    taken.insert(slot.id.clone());
                    result.insert(window.id, slot.id.clone());
                }
                None => leftovers.push(*window),
            }
        }

        // Pass 2: everything else takes the largest free general slot.
        for window in leftovers {
            let Some(slot) = self.largest_free_general_slot(&taken) else {
                continue;
            };
            taken.insert(slot.id.clone());
            result.insert(window.id, slot.id.clone());
        }

        result
    }

    fn largest_free_general_slot(&self, taken: &HashSet<SlotId>) -> Option<&'a Slot> {
        self.layout
            .slots
            .iter()
            .filter(|s| !taken.contains(&s.id))
            .filter(|s| !s.is_telemetry && s.assigned_app.is_none())
            .max_by(|a, b| {
                let area = |s: &Slot| s.bounds.width * s.bounds.height;
                area(a)
                    .partial_cmp(&area(b))
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    }

    /// Grow occupied slots into their empty neighbours.
    ///
    /// If Slack is closed, its neighbours expand to fill the space rather than
    /// leaving a permanent gap. Runs to a fixed point so a chain of empty slots
    /// collapses fully, capped to keep it bounded.
    fn collapse_empty_slots(&self, occupied: &HashSet<SlotId>) -> HashMap<SlotId, NormalizedRect> {
        let mut bounds: HashMap<SlotId, NormalizedRect> = self
            .layout
            .slots
            .iter()
            .map(|s| (s.id.clone(), s.bounds))
            .collect();

        let empties: Vec<SlotId> = self
            .layout
            .slots
            .iter()
            .filter(|s| !occupied.contains(&s.id))
            .map(|s| s.id.clone())
            .collect();

        let monitor_of: HashMap<SlotId, MonitorId> = self
            .layout
            .slots
            .iter()
            .map(|s| (s.id.clone(), s.monitor.clone()))
            .collect();

        let mut remaining: Vec<SlotId> = empties;

        // Bounded fixed point: each pass must absorb at least one empty slot.
        for _ in 0..self.layout.slots.len().max(1) {
            let mut absorbed_any = false;
            let mut still_empty = Vec::new();

            for empty_id in remaining.drain(..) {
                let empty = bounds[&empty_id];
                let monitor = &monitor_of[&empty_id];

                let neighbours: Vec<SlotId> = occupied
                    .iter()
                    .filter(|id| monitor_of.get(*id) == Some(monitor))
                    .filter(|id| shares_full_edge(&bounds[*id], &empty))
                    .cloned()
                    .collect();

                if neighbours.is_empty() {
                    still_empty.push(empty_id);
                    continue;
                }

                absorb(&mut bounds, &neighbours, empty);
                absorbed_any = true;
            }

            remaining = still_empty;
            if !absorbed_any || remaining.is_empty() {
                break;
            }
        }

        bounds
    }
}

/// Whether `neighbour` shares a complete edge with `empty`, making it eligible
/// to absorb that space without leaving a hole.
fn shares_full_edge(neighbour: &NormalizedRect, empty: &NormalizedRect) -> bool {
    let horizontally_aligned = close(neighbour.y, empty.y) && close(neighbour.height, empty.height);
    let vertically_aligned = close(neighbour.x, empty.x) && close(neighbour.width, empty.width);

    let touches_left = close(neighbour.x + neighbour.width, empty.x);
    let touches_right = close(empty.x + empty.width, neighbour.x);
    let touches_top = close(neighbour.y + neighbour.height, empty.y);
    let touches_bottom = close(empty.y + empty.height, neighbour.y);

    (horizontally_aligned && (touches_left || touches_right))
        || (vertically_aligned && (touches_top || touches_bottom))
}

/// Split `empty` evenly among the slots that border it.
fn absorb(
    bounds: &mut HashMap<SlotId, NormalizedRect>,
    neighbours: &[SlotId],
    empty: NormalizedRect,
) {
    let share = 1.0 / neighbours.len() as f32;

    for id in neighbours {
        let current = bounds[id];
        let horizontal = close(current.y, empty.y) && close(current.height, empty.height);

        let grown = if horizontal {
            let extra = empty.width * share;
            if current.x > empty.x {
                // Neighbour sits to the right: extend leftwards.
                NormalizedRect::new(
                    current.x - extra,
                    current.y,
                    current.width + extra,
                    current.height,
                )
            } else {
                NormalizedRect::new(current.x, current.y, current.width + extra, current.height)
            }
        } else {
            let extra = empty.height * share;
            if current.y > empty.y {
                NormalizedRect::new(
                    current.x,
                    current.y - extra,
                    current.width,
                    current.height + extra,
                )
            } else {
                NormalizedRect::new(current.x, current.y, current.width, current.height + extra)
            }
        };

        bounds.insert(id.clone(), grown);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dl_core::{AppId, DisplaySet, MinimizeReason, TileMode};

    fn monitor_id() -> MonitorId {
        MonitorId::new("dell")
    }

    fn monitor() -> Monitor {
        Monitor {
            id: monitor_id(),
            name: "DELL U2720Q".into(),
            bounds: Rect::new(0, 0, 1000, 1000),
            work_area: Rect::new(0, 0, 1000, 1000),
            scale_factor: 1.0,
            is_primary: true,
        }
    }

    fn slot(id: &str, app: Option<&str>, bounds: NormalizedRect) -> Slot {
        Slot {
            id: SlotId::new(id),
            monitor: monitor_id(),
            bounds,
            assigned_app: app.map(AppId::new),
            is_telemetry: false,
        }
    }

    fn window(id: u64, app: Option<&str>) -> WindowRecord {
        WindowRecord {
            id: WindowId(id),
            app_id: app.map(AppId::new),
            title: format!("window {id}"),
            monitor: Some(monitor_id()),
            slot: None,
            tile_mode: TileMode::Tiled,
            minimized: None,
        }
    }

    fn layout(slots: Vec<Slot>) -> SlotLayout {
        let mut l = SlotLayout::new(DisplaySet::new(vec![monitor_id()]), "Work", slots);
        l.gap = 0;
        l
    }

    #[test]
    fn apps_land_in_their_assigned_slots_regardless_of_launch_order() {
        let l = layout(vec![
            slot(
                "left",
                Some("vscode"),
                NormalizedRect::new(0.0, 0.0, 0.5, 1.0),
            ),
            slot(
                "right",
                Some("slack"),
                NormalizedRect::new(0.5, 0.0, 0.5, 1.0),
            ),
        ]);
        let monitors = [monitor()];

        // Slack opens first, VS Code second — placement must not depend on it.
        let windows = vec![window(1, Some("slack")), window(2, Some("vscode"))];
        let placements = Resolver::new(&l, &monitors).resolve(&windows);

        let slack = placements.iter().find(|p| p.window == WindowId(1)).unwrap();
        let code = placements.iter().find(|p| p.window == WindowId(2)).unwrap();

        assert_eq!(slack.slot, SlotId::new("right"));
        assert_eq!(code.slot, SlotId::new("left"));
        assert_eq!(code.bounds, Rect::new(0, 0, 500, 1000));
        assert_eq!(slack.bounds, Rect::new(500, 0, 500, 1000));
    }

    #[test]
    fn empty_slot_is_absorbed_by_its_neighbour() {
        let l = layout(vec![
            slot(
                "left",
                Some("vscode"),
                NormalizedRect::new(0.0, 0.0, 0.5, 1.0),
            ),
            slot(
                "right",
                Some("slack"),
                NormalizedRect::new(0.5, 0.0, 0.5, 1.0),
            ),
        ]);
        let monitors = [monitor()];

        // Slack is not running: its slot must not leave a permanent gap.
        let windows = vec![window(1, Some("vscode"))];
        let placements = Resolver::new(&l, &monitors).resolve(&windows);

        assert_eq!(placements.len(), 1);
        assert_eq!(
            placements[0].bounds,
            Rect::new(0, 0, 1000, 1000),
            "VS Code should expand across the whole monitor"
        );
    }

    #[test]
    fn empty_slot_splits_evenly_between_two_neighbours() {
        // Three equal columns; the middle one is empty.
        let l = layout(vec![
            slot(
                "a",
                Some("vscode"),
                NormalizedRect::new(0.0, 0.0, 1.0 / 3.0, 1.0),
            ),
            slot(
                "b",
                Some("postman"),
                NormalizedRect::new(1.0 / 3.0, 0.0, 1.0 / 3.0, 1.0),
            ),
            slot(
                "c",
                Some("chrome"),
                NormalizedRect::new(2.0 / 3.0, 0.0, 1.0 / 3.0, 1.0),
            ),
        ]);
        let monitors = [monitor()];

        let windows = vec![window(1, Some("vscode")), window(2, Some("chrome"))];
        let placements = Resolver::new(&l, &monitors).resolve(&windows);

        let a = placements.iter().find(|p| p.window == WindowId(1)).unwrap();
        let c = placements.iter().find(|p| p.window == WindowId(2)).unwrap();

        // Each absorbs half the vacant middle column.
        assert_eq!(a.bounds, Rect::new(0, 0, 500, 1000));
        assert_eq!(c.bounds, Rect::new(500, 0, 500, 1000));
    }

    #[test]
    fn minimized_and_floating_windows_do_not_claim_slots() {
        let l = layout(vec![
            slot(
                "left",
                Some("vscode"),
                NormalizedRect::new(0.0, 0.0, 0.5, 1.0),
            ),
            slot(
                "right",
                Some("slack"),
                NormalizedRect::new(0.5, 0.0, 0.5, 1.0),
            ),
        ]);
        let monitors = [monitor()];

        let mut minimized = window(1, Some("slack"));
        minimized.minimized = Some(MinimizeReason::User);
        let mut floating = window(2, Some("postman"));
        floating.tile_mode = TileMode::Floating;

        let windows = vec![minimized, floating, window(3, Some("vscode"))];
        let placements = Resolver::new(&l, &monitors).resolve(&windows);

        assert_eq!(placements.len(), 1);
        assert_eq!(placements[0].window, WindowId(3));
    }

    #[test]
    fn unassigned_app_takes_the_largest_free_general_slot() {
        let l = layout(vec![
            slot("small", None, NormalizedRect::new(0.0, 0.0, 0.25, 1.0)),
            slot("big", None, NormalizedRect::new(0.25, 0.0, 0.75, 1.0)),
        ]);
        let monitors = [monitor()];

        let windows = vec![window(1, Some("some-unknown-tool"))];
        let placements = Resolver::new(&l, &monitors).resolve(&windows);

        assert_eq!(placements[0].slot, SlotId::new("big"));
    }

    #[test]
    fn telemetry_slot_is_never_given_to_another_app() {
        let mut telemetry = slot("telemetry", None, NormalizedRect::new(0.0, 0.0, 0.8, 1.0));
        telemetry.is_telemetry = true;
        let l = layout(vec![
            telemetry,
            slot("spare", None, NormalizedRect::new(0.8, 0.0, 0.2, 1.0)),
        ]);
        let monitors = [monitor()];

        let windows = vec![window(1, Some("chrome"))];
        let placements = Resolver::new(&l, &monitors).resolve(&windows);

        assert_eq!(
            placements[0].slot,
            SlotId::new("spare"),
            "the telemetry slot is reserved even though it is larger"
        );
    }

    #[test]
    fn windows_with_nowhere_to_go_are_reported_as_unplaceable() {
        let l = layout(vec![slot("only", Some("vscode"), NormalizedRect::FULL)]);
        let monitors = [monitor()];

        let windows = vec![window(1, Some("vscode")), window(2, Some("chrome"))];
        let resolver = Resolver::new(&l, &monitors);

        assert_eq!(resolver.resolve(&windows).len(), 1);
        assert_eq!(
            resolver.unplaceable(&windows),
            vec![WindowId(2)],
            "the caller minimises these to the dock rather than stranding them"
        );
    }

    #[test]
    fn gap_is_applied_to_every_tile() {
        let mut l = layout(vec![
            slot(
                "left",
                Some("vscode"),
                NormalizedRect::new(0.0, 0.0, 0.5, 1.0),
            ),
            slot(
                "right",
                Some("slack"),
                NormalizedRect::new(0.5, 0.0, 0.5, 1.0),
            ),
        ]);
        l.gap = 10;
        let monitors = [monitor()];

        let windows = vec![window(1, Some("vscode")), window(2, Some("slack"))];
        let placements = Resolver::new(&l, &monitors).resolve(&windows);

        assert_eq!(placements[0].bounds, Rect::new(10, 10, 480, 980));
        assert_eq!(placements[1].bounds, Rect::new(510, 10, 480, 980));
    }
}
