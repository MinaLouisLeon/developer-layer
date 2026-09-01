//! Slot editing — the engine behind edit mode.
//!
//! Edit mode is direct manipulation of the live workspace: drag a border and
//! the two slots sharing it resize together. That "together" is the whole
//! point. Resizing one slot alone would open a gap, and a gap in a strict
//! no-overlap grid is dead screen space no window can ever occupy.
//!
//! Every operation preserves two invariants:
//!
//! - **Gapless** — the slots on a display always tile it completely.
//! - **Usable** — no slot shrinks below [`MIN_SLOT_FRACTION`], because a
//!   two-percent-wide slot is a way to lose a window, not a layout choice.

use dl_core::{AppId, MonitorId, NormalizedRect, Slot, SlotId, SlotLayout};

/// Smallest slot edge, as a fraction of the display.
///
/// Ten percent of a 1920px display is 192px — narrow, but still a window you
/// can see and grab.
pub const MIN_SLOT_FRACTION: f32 = 0.1;

/// Tolerance for treating two normalised edges as the same border.
const EPS: f32 = 0.001;

fn close(a: f32, b: f32) -> bool {
    (a - b).abs() < EPS
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Edge {
    Left,
    Right,
    Top,
    Bottom,
}

impl Edge {
    fn opposite(self) -> Self {
        match self {
            Self::Left => Self::Right,
            Self::Right => Self::Left,
            Self::Top => Self::Bottom,
            Self::Bottom => Self::Top,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Axis {
    Horizontal,
    Vertical,
}

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum EditError {
    #[error("no slot with id `{0}`")]
    NoSuchSlot(SlotId),
    #[error("no slot shares that border, so moving it would leave a gap")]
    NoNeighbour,
    #[error("that would shrink a slot below the minimum usable size")]
    TooSmall,
    #[error("a slot must have a neighbour to absorb it before it can be removed")]
    CannotAbsorb,
}

/// Move the border on one edge of a slot by `delta` (a fraction of the display).
///
/// The slots on the other side of that border move with it, so the grid stays
/// gapless. Rejects the move outright if it would shrink anything below the
/// minimum — a partially applied resize is worse than a refused one.
pub fn move_border(
    layout: &mut SlotLayout,
    slot_id: &SlotId,
    edge: Edge,
    delta: f32,
) -> Result<(), EditError> {
    let slot = layout
        .slot(slot_id)
        .ok_or_else(|| EditError::NoSuchSlot(slot_id.clone()))?;
    let monitor = slot.monitor.clone();
    let bounds = slot.bounds;

    let neighbours = neighbours_across(layout, &monitor, slot_id, bounds, edge);
    if neighbours.is_empty() {
        // The display's outer edge. Moving it would either overflow the screen
        // or leave a strip nothing can fill.
        return Err(EditError::NoNeighbour);
    }

    // Validate the whole move before mutating anything.
    let resized = apply_to_self(bounds, edge, delta);
    if too_small(&resized) {
        return Err(EditError::TooSmall);
    }
    for id in &neighbours {
        let n = layout.slot(id).expect("collected from this layout").bounds;
        if too_small(&apply_to_neighbour(n, edge, delta)) {
            return Err(EditError::TooSmall);
        }
    }

    for slot in &mut layout.slots {
        if &slot.id == slot_id {
            slot.bounds = resized;
        } else if neighbours.contains(&slot.id) {
            slot.bounds = apply_to_neighbour(slot.bounds, edge, delta);
        }
    }

    Ok(())
}

/// Divide a slot in two along `axis`. The new slot takes the far half.
pub fn split(
    layout: &mut SlotLayout,
    slot_id: &SlotId,
    axis: Axis,
    new_id: SlotId,
) -> Result<(), EditError> {
    let slot = layout
        .slot(slot_id)
        .ok_or_else(|| EditError::NoSuchSlot(slot_id.clone()))?;
    let bounds = slot.bounds;
    let monitor = slot.monitor.clone();

    let (near, far) = match axis {
        Axis::Vertical => (
            NormalizedRect::new(bounds.x, bounds.y, bounds.width / 2.0, bounds.height),
            NormalizedRect::new(
                bounds.x + bounds.width / 2.0,
                bounds.y,
                bounds.width / 2.0,
                bounds.height,
            ),
        ),
        Axis::Horizontal => (
            NormalizedRect::new(bounds.x, bounds.y, bounds.width, bounds.height / 2.0),
            NormalizedRect::new(
                bounds.x,
                bounds.y + bounds.height / 2.0,
                bounds.width,
                bounds.height / 2.0,
            ),
        ),
    };

    if too_small(&near) || too_small(&far) {
        return Err(EditError::TooSmall);
    }

    for slot in &mut layout.slots {
        if &slot.id == slot_id {
            slot.bounds = near;
            break;
        }
    }

    layout.slots.push(Slot {
        id: new_id,
        monitor,
        bounds: far,
        assigned_app: None,
        is_telemetry: false,
    });

    Ok(())
}

/// Remove a slot, giving its space to a neighbour that shares a full edge.
pub fn remove(layout: &mut SlotLayout, slot_id: &SlotId) -> Result<(), EditError> {
    let slot = layout
        .slot(slot_id)
        .ok_or_else(|| EditError::NoSuchSlot(slot_id.clone()))?;
    let monitor = slot.monitor.clone();
    let bounds = slot.bounds;

    // A neighbour can only absorb the space if the union of the two is still a
    // rectangle — that means sharing the border along its *entire* length, not
    // merely overlapping it. A partially overlapping neighbour would have to
    // grow into an L shape, and growing it to a bounding box instead would
    // overlap whatever sits in the notch.
    let absorber = [Edge::Left, Edge::Right, Edge::Top, Edge::Bottom]
        .into_iter()
        .find_map(|edge| {
            neighbours_across(layout, &monitor, slot_id, bounds, edge)
                .into_iter()
                .find(|id| {
                    let n = layout.slot(id).expect("collected from this layout").bounds;
                    aligns_for_absorption(bounds, n, edge)
                })
                .map(|id| (edge, id))
        });

    let Some((edge, absorber_id)) = absorber else {
        // The last slot on a display. Removing it would leave the display with
        // no slot at all, so it is refused rather than silently allowed.
        return Err(EditError::CannotAbsorb);
    };

    for slot in &mut layout.slots {
        if slot.id == absorber_id {
            // `edge` is the side of the *removed* slot the neighbour sits on,
            // so from the absorber's point of view the vacated space lies the
            // other way.
            slot.bounds = grow_into(slot.bounds, bounds, edge.opposite());
            break;
        }
    }
    layout.slots.retain(|s| &s.id != slot_id);

    Ok(())
}

/// Bind an application to a slot, clearing any previous binding elsewhere.
///
/// One slot per app: two slots claiming the same application would make
/// placement depend on iteration order, and the entire point of assigned slots
/// is that it does not.
pub fn assign_app(
    layout: &mut SlotLayout,
    slot_id: &SlotId,
    app: Option<AppId>,
) -> Result<(), EditError> {
    if layout.slot(slot_id).is_none() {
        return Err(EditError::NoSuchSlot(slot_id.clone()));
    }

    if let Some(app) = &app {
        for slot in &mut layout.slots {
            if slot.assigned_app.as_ref() == Some(app) {
                slot.assigned_app = None;
            }
        }
    }

    for slot in &mut layout.slots {
        if &slot.id == slot_id {
            slot.assigned_app = app;
            break;
        }
    }

    Ok(())
}

/// Slots on the far side of `edge` that share that border with `bounds`.
fn neighbours_across(
    layout: &SlotLayout,
    monitor: &MonitorId,
    slot_id: &SlotId,
    bounds: NormalizedRect,
    edge: Edge,
) -> Vec<SlotId> {
    layout
        .slots
        .iter()
        .filter(|s| &s.monitor == monitor && &s.id != slot_id)
        .filter(|s| touches(bounds, s.bounds, edge))
        .map(|s| s.id.clone())
        .collect()
}

/// Whether `other` sits immediately across `edge` of `bounds`, overlapping it
/// along the perpendicular axis.
fn touches(bounds: NormalizedRect, other: NormalizedRect, edge: Edge) -> bool {
    match edge {
        Edge::Right => close(other.x, bounds.x + bounds.width) && spans_vertically(bounds, other),
        Edge::Left => close(other.x + other.width, bounds.x) && spans_vertically(bounds, other),
        Edge::Bottom => {
            close(other.y, bounds.y + bounds.height) && spans_horizontally(bounds, other)
        }
        Edge::Top => close(other.y + other.height, bounds.y) && spans_horizontally(bounds, other),
    }
}

/// Whether absorbing `other` into the space of `bounds` yields a rectangle.
///
/// Horizontal absorption needs identical vertical extent, and vice versa.
fn aligns_for_absorption(bounds: NormalizedRect, other: NormalizedRect, edge: Edge) -> bool {
    match edge {
        Edge::Left | Edge::Right => close(other.y, bounds.y) && close(other.height, bounds.height),
        Edge::Top | Edge::Bottom => close(other.x, bounds.x) && close(other.width, bounds.width),
    }
}

fn spans_vertically(a: NormalizedRect, b: NormalizedRect) -> bool {
    a.y < b.y + b.height - EPS && b.y < a.y + a.height - EPS
}

fn spans_horizontally(a: NormalizedRect, b: NormalizedRect) -> bool {
    a.x < b.x + b.width - EPS && b.x < a.x + a.width - EPS
}

fn apply_to_self(b: NormalizedRect, edge: Edge, delta: f32) -> NormalizedRect {
    match edge {
        Edge::Right => NormalizedRect::new(b.x, b.y, b.width + delta, b.height),
        Edge::Left => NormalizedRect::new(b.x + delta, b.y, b.width - delta, b.height),
        Edge::Bottom => NormalizedRect::new(b.x, b.y, b.width, b.height + delta),
        Edge::Top => NormalizedRect::new(b.x, b.y + delta, b.width, b.height - delta),
    }
}

fn apply_to_neighbour(b: NormalizedRect, edge: Edge, delta: f32) -> NormalizedRect {
    match edge {
        Edge::Right => NormalizedRect::new(b.x + delta, b.y, b.width - delta, b.height),
        Edge::Left => NormalizedRect::new(b.x, b.y, b.width + delta, b.height),
        Edge::Bottom => NormalizedRect::new(b.x, b.y + delta, b.width, b.height - delta),
        Edge::Top => NormalizedRect::new(b.x, b.y, b.width, b.height + delta),
    }
}

/// Extend `absorber` across `vacated`, which sits on its `edge` side.
fn grow_into(absorber: NormalizedRect, vacated: NormalizedRect, edge: Edge) -> NormalizedRect {
    match edge {
        Edge::Left => NormalizedRect::new(
            vacated.x,
            absorber.y,
            absorber.width + vacated.width,
            absorber.height,
        ),
        Edge::Right => NormalizedRect::new(
            absorber.x,
            absorber.y,
            absorber.width + vacated.width,
            absorber.height,
        ),
        Edge::Top => NormalizedRect::new(
            absorber.x,
            vacated.y,
            absorber.width,
            absorber.height + vacated.height,
        ),
        Edge::Bottom => NormalizedRect::new(
            absorber.x,
            absorber.y,
            absorber.width,
            absorber.height + vacated.height,
        ),
    }
}

fn too_small(b: &NormalizedRect) -> bool {
    b.width < MIN_SLOT_FRACTION - EPS || b.height < MIN_SLOT_FRACTION - EPS
}

#[cfg(test)]
mod tests {
    use super::*;
    use dl_core::DisplaySet;

    fn mon() -> MonitorId {
        MonitorId::new("dell")
    }

    fn slot(id: &str, b: NormalizedRect) -> Slot {
        Slot {
            id: SlotId::new(id),
            monitor: mon(),
            bounds: b,
            assigned_app: None,
            is_telemetry: false,
        }
    }

    /// Two equal columns, the canonical starting layout.
    fn columns() -> SlotLayout {
        SlotLayout::new(
            DisplaySet::new(vec![mon()]),
            "Work",
            vec![
                slot("left", NormalizedRect::new(0.0, 0.0, 0.5, 1.0)),
                slot("right", NormalizedRect::new(0.5, 0.0, 0.5, 1.0)),
            ],
        )
    }

    fn bounds_of(l: &SlotLayout, id: &str) -> NormalizedRect {
        l.slot(&SlotId::new(id)).expect("slot exists").bounds
    }

    /// Total area covered on the display, which must always be exactly 1.
    fn coverage(l: &SlotLayout) -> f32 {
        l.slots
            .iter()
            .map(|s| s.bounds.width * s.bounds.height)
            .sum()
    }

    #[test]
    fn dragging_a_border_resizes_both_neighbours() {
        let mut l = columns();

        move_border(&mut l, &SlotId::new("left"), Edge::Right, 0.2).expect("resize");

        assert_eq!(
            bounds_of(&l, "left"),
            NormalizedRect::new(0.0, 0.0, 0.7, 1.0)
        );
        assert_eq!(
            bounds_of(&l, "right"),
            NormalizedRect::new(0.7, 0.0, 0.3, 1.0)
        );
        assert!(
            (coverage(&l) - 1.0).abs() < 0.001,
            "the grid must stay gapless"
        );
    }

    #[test]
    fn dragging_a_border_the_other_way_works_too() {
        let mut l = columns();

        move_border(&mut l, &SlotId::new("right"), Edge::Left, -0.2).expect("resize");

        assert_eq!(
            bounds_of(&l, "right"),
            NormalizedRect::new(0.3, 0.0, 0.7, 1.0)
        );
        assert_eq!(
            bounds_of(&l, "left"),
            NormalizedRect::new(0.0, 0.0, 0.3, 1.0)
        );
        assert!((coverage(&l) - 1.0).abs() < 0.001);
    }

    #[test]
    fn the_outer_edge_of_a_display_cannot_be_dragged() {
        // Nothing is across it, so moving it would overflow the screen.
        let mut l = columns();

        assert_eq!(
            move_border(&mut l, &SlotId::new("left"), Edge::Left, 0.1),
            Err(EditError::NoNeighbour)
        );
    }

    #[test]
    fn a_resize_that_would_crush_a_slot_is_refused_entirely() {
        let mut l = columns();
        let before = l.clone();

        assert_eq!(
            move_border(&mut l, &SlotId::new("left"), Edge::Right, 0.45),
            Err(EditError::TooSmall)
        );
        assert_eq!(l, before, "a refused edit must not partially apply");
    }

    #[test]
    fn a_border_shared_by_two_slots_moves_both_of_them() {
        // Left column, with the right half split into two stacked rows.
        let mut l = SlotLayout::new(
            DisplaySet::new(vec![mon()]),
            "Work",
            vec![
                slot("left", NormalizedRect::new(0.0, 0.0, 0.5, 1.0)),
                slot("top-right", NormalizedRect::new(0.5, 0.0, 0.5, 0.5)),
                slot("bottom-right", NormalizedRect::new(0.5, 0.5, 0.5, 0.5)),
            ],
        );

        move_border(&mut l, &SlotId::new("left"), Edge::Right, 0.2).expect("resize");

        // Both rows must follow the border, or a gap opens beside one of them.
        assert_eq!(bounds_of(&l, "top-right").x, 0.7);
        assert_eq!(bounds_of(&l, "bottom-right").x, 0.7);
        assert!((coverage(&l) - 1.0).abs() < 0.001);
    }

    #[test]
    fn splitting_a_slot_keeps_the_display_covered() {
        let mut l = columns();

        split(
            &mut l,
            &SlotId::new("left"),
            Axis::Horizontal,
            SlotId::new("new"),
        )
        .expect("split");

        assert_eq!(l.slots.len(), 3);
        assert_eq!(
            bounds_of(&l, "left"),
            NormalizedRect::new(0.0, 0.0, 0.5, 0.5)
        );
        assert_eq!(
            bounds_of(&l, "new"),
            NormalizedRect::new(0.0, 0.5, 0.5, 0.5)
        );
        assert!((coverage(&l) - 1.0).abs() < 0.001);
    }

    #[test]
    fn splitting_something_already_tiny_is_refused() {
        let mut l = SlotLayout::new(
            DisplaySet::new(vec![mon()]),
            "Work",
            vec![slot("only", NormalizedRect::new(0.0, 0.0, 1.0, 0.15))],
        );

        assert_eq!(
            split(
                &mut l,
                &SlotId::new("only"),
                Axis::Horizontal,
                SlotId::new("new")
            ),
            Err(EditError::TooSmall)
        );
    }

    #[test]
    fn removing_a_slot_hands_its_space_to_a_neighbour() {
        let mut l = columns();

        remove(&mut l, &SlotId::new("right")).expect("remove");

        assert_eq!(l.slots.len(), 1);
        assert_eq!(bounds_of(&l, "left"), NormalizedRect::FULL);
        assert!((coverage(&l) - 1.0).abs() < 0.001);
    }

    #[test]
    fn the_last_slot_on_a_display_cannot_be_removed() {
        // Removing it would leave the display with nowhere to put a window.
        let mut l = SlotLayout::new(
            DisplaySet::new(vec![mon()]),
            "Work",
            vec![slot("only", NormalizedRect::FULL)],
        );

        assert_eq!(
            remove(&mut l, &SlotId::new("only")),
            Err(EditError::CannotAbsorb)
        );
    }

    #[test]
    fn assigning_an_app_releases_the_slot_it_used_to_own() {
        // Two slots claiming one app would make placement order-dependent,
        // which defeats the point of assigned slots.
        let mut l = columns();
        assign_app(&mut l, &SlotId::new("left"), Some(AppId::new("vscode"))).expect("assign");

        assign_app(&mut l, &SlotId::new("right"), Some(AppId::new("vscode"))).expect("reassign");

        assert_eq!(l.slot(&SlotId::new("left")).unwrap().assigned_app, None);
        assert_eq!(
            l.slot(&SlotId::new("right")).unwrap().assigned_app,
            Some(AppId::new("vscode"))
        );
    }

    #[test]
    fn editing_an_unknown_slot_reports_which_one() {
        let mut l = columns();
        let missing = SlotId::new("ghost");

        assert_eq!(
            move_border(&mut l, &missing, Edge::Right, 0.1),
            Err(EditError::NoSuchSlot(missing.clone()))
        );
        assert_eq!(
            remove(&mut l, &missing),
            Err(EditError::NoSuchSlot(missing))
        );
    }

    #[test]
    fn a_sequence_of_edits_never_breaks_coverage() {
        // Edit mode is a stream of small operations; drift would accumulate.
        let mut l = columns();

        split(
            &mut l,
            &SlotId::new("right"),
            Axis::Horizontal,
            SlotId::new("r2"),
        )
        .expect("split");
        move_border(&mut l, &SlotId::new("left"), Edge::Right, 0.15).expect("resize");
        split(
            &mut l,
            &SlotId::new("left"),
            Axis::Horizontal,
            SlotId::new("l2"),
        )
        .expect("split");
        move_border(&mut l, &SlotId::new("r2"), Edge::Top, -0.1).expect("resize");
        remove(&mut l, &SlotId::new("l2")).expect("remove");

        assert!(
            (coverage(&l) - 1.0).abs() < 0.001,
            "coverage drifted to {} after five edits",
            coverage(&l)
        );
        assert!(l.validate().is_empty());
    }
}
