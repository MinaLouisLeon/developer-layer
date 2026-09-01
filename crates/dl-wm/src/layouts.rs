//! Choosing which layout applies, and inventing one when none does.
//!
//! Layouts are keyed by [`DisplaySet`], so docking and undocking swap
//! arrangements rather than overwriting one another. Selection is deliberately
//! total: there is always *some* layout, because a display change that leaves
//! the user with no arrangement is worse than an imperfect guess.

use dl_core::{Config, DisplaySet, Monitor, MonitorId, NormalizedRect, Slot, SlotId, SlotLayout};

/// How a layout was arrived at. Surfaced so the UI can say "this is a generated
/// layout, save it to keep your edits" rather than silently discarding work.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LayoutSource {
    /// A layout saved for exactly this display set.
    Saved,
    /// The designated default, reprojected onto the current displays.
    Default,
    /// Nothing configured — an even split was generated.
    Generated,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SelectedLayout {
    pub layout: SlotLayout,
    pub source: LayoutSource,
}

/// Resolve the layout for the currently connected displays.
///
/// Order: exact match for this display set, then the designated default, then a
/// generated even split.
pub fn select(config: &Config, monitors: &[Monitor]) -> SelectedLayout {
    let set = DisplaySet::from_monitors(monitors);

    if let Some(saved) = config.layouts.iter().find(|l| l.display_set == set) {
        return SelectedLayout {
            layout: saved.clone(),
            source: LayoutSource::Saved,
        };
    }

    // The default was authored for a different display set, so its slots point
    // at monitors that may not be present. Reproject rather than adopting it
    // wholesale, or half the slots would reference absent displays and their
    // windows would be orphaned for no reason.
    if let Some(name) = &config.default_layout {
        if let Some(default) = config.layouts.iter().find(|l| &l.name == name) {
            return SelectedLayout {
                layout: reproject(default, monitors, &set),
                source: LayoutSource::Default,
            };
        }
    }

    SelectedLayout {
        layout: even_split(monitors, &set),
        source: LayoutSource::Generated,
    }
}

/// Adapt a layout authored for other displays onto the current ones.
///
/// Slots whose monitor is still connected keep their geometry. Slots for absent
/// monitors are dropped — their windows minimise to the dock, which is the
/// agreed rule rather than force-placing them somewhere arbitrary.
fn reproject(source: &SlotLayout, monitors: &[Monitor], set: &DisplaySet) -> SlotLayout {
    let mut slots: Vec<Slot> = source
        .slots
        .iter()
        .filter(|s| set.contains(&s.monitor))
        .cloned()
        .collect();

    // Any connected display the default says nothing about still needs to be
    // usable, so give it a single full-screen slot.
    for monitor in monitors {
        if !slots.iter().any(|s| s.monitor == monitor.id) {
            slots.push(full_slot(&monitor.id, 0));
        }
    }

    SlotLayout {
        display_set: set.clone(),
        name: source.name.clone(),
        slots,
        gap: source.gap,
    }
}

/// Two equal columns per display — a usable starting point that needs no
/// configuration, and an obvious thing to start dragging in edit mode.
pub fn even_split(monitors: &[Monitor], set: &DisplaySet) -> SlotLayout {
    let mut slots = Vec::with_capacity(monitors.len() * 2);

    for monitor in monitors {
        slots.push(Slot {
            id: SlotId::new(format!("{}-a", slug(&monitor.id))),
            monitor: monitor.id.clone(),
            bounds: NormalizedRect::new(0.0, 0.0, 0.5, 1.0),
            assigned_app: None,
            is_telemetry: false,
        });
        slots.push(Slot {
            id: SlotId::new(format!("{}-b", slug(&monitor.id))),
            monitor: monitor.id.clone(),
            bounds: NormalizedRect::new(0.5, 0.0, 0.5, 1.0),
            assigned_app: None,
            is_telemetry: false,
        });
    }

    SlotLayout {
        display_set: set.clone(),
        name: "Generated".into(),
        slots,
        gap: 8,
    }
}

fn full_slot(monitor: &MonitorId, index: usize) -> Slot {
    Slot {
        id: SlotId::new(format!("{}-{index}", slug(monitor))),
        monitor: monitor.clone(),
        bounds: NormalizedRect::FULL,
        assigned_app: None,
        is_telemetry: false,
    }
}

/// Monitor device paths contain characters that make unreadable slot ids.
fn slug(monitor: &MonitorId) -> String {
    monitor
        .as_str()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .chars()
        .rev()
        .take(12)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use dl_core::Rect;

    fn monitor(id: &str, primary: bool) -> Monitor {
        Monitor {
            id: MonitorId::new(id),
            name: id.into(),
            bounds: Rect::new(0, 0, 1920, 1080),
            work_area: Rect::new(0, 0, 1920, 1040),
            scale_factor: 1.0,
            is_primary: primary,
        }
    }

    fn layout_for(name: &str, monitors: &[&str]) -> SlotLayout {
        let set = DisplaySet::new(monitors.iter().map(|m| MonitorId::new(*m)).collect());
        let slots = monitors
            .iter()
            .map(|m| full_slot(&MonitorId::new(*m), 0))
            .collect();
        SlotLayout::new(set, name, slots)
    }

    #[test]
    fn an_exact_display_set_match_wins() {
        let config = Config {
            layouts: vec![layout_for("Docked", &["laptop", "dell"])],
            ..Default::default()
        };

        let selected = select(&config, &[monitor("laptop", true), monitor("dell", false)]);

        assert_eq!(selected.source, LayoutSource::Saved);
        assert_eq!(selected.layout.name, "Docked");
    }

    #[test]
    fn port_order_does_not_affect_the_match() {
        let config = Config {
            layouts: vec![layout_for("Docked", &["laptop", "dell"])],
            ..Default::default()
        };

        // Same monitors, enumerated the other way round.
        let selected = select(&config, &[monitor("dell", false), monitor("laptop", true)]);

        assert_eq!(selected.source, LayoutSource::Saved);
    }

    #[test]
    fn undocking_falls_back_to_the_designated_default() {
        let config = Config {
            layouts: vec![layout_for("Docked", &["laptop", "dell"])],
            default_layout: Some("Docked".into()),
            ..Default::default()
        };

        // The dell is gone; no layout exists for laptop alone.
        let selected = select(&config, &[monitor("laptop", true)]);

        assert_eq!(selected.source, LayoutSource::Default);
        assert!(
            selected
                .layout
                .slots
                .iter()
                .all(|s| s.monitor == MonitorId::new("laptop")),
            "slots for absent displays must be dropped, not carried over"
        );
    }

    #[test]
    fn a_connected_display_the_default_ignores_still_gets_a_slot() {
        let config = Config {
            layouts: vec![layout_for("Docked", &["laptop"])],
            default_layout: Some("Docked".into()),
            ..Default::default()
        };

        let selected = select(
            &config,
            &[monitor("laptop", true), monitor("newly-plugged", false)],
        );

        assert!(
            selected
                .layout
                .slots
                .iter()
                .any(|s| s.monitor == MonitorId::new("newly-plugged")),
            "a display with no slot would be dead space"
        );
    }

    #[test]
    fn nothing_configured_generates_an_even_split() {
        let selected = select(&Config::default(), &[monitor("laptop", true)]);

        assert_eq!(selected.source, LayoutSource::Generated);
        assert_eq!(selected.layout.slots.len(), 2);
        assert!(selected.layout.validate().is_empty());
    }

    #[test]
    fn generated_layouts_cover_every_display_exactly() {
        let monitors = [monitor("a", true), monitor("b", false), monitor("c", false)];
        let set = DisplaySet::from_monitors(&monitors);

        let layout = even_split(&monitors, &set);

        assert!(layout.validate().is_empty());
        for m in &monitors {
            let covered: f32 = layout
                .slots_on(&m.id)
                .map(|s| s.bounds.width * s.bounds.height)
                .sum();
            assert!(
                (covered - 1.0).abs() < 0.001,
                "slots on {} cover {covered}, expected the whole work area",
                m.id
            );
        }
    }

    #[test]
    fn slot_ids_are_unique_across_displays() {
        let monitors = [
            monitor(r"\\?\DISPLAY#DEL41A8#5&1234abcd&0&UID4353", true),
            monitor(r"\\?\DISPLAY#BNQ7F42#5&9876fedc&0&UID4354", false),
        ];
        let set = DisplaySet::from_monitors(&monitors);

        let layout = even_split(&monitors, &set);
        let ids: std::collections::HashSet<_> = layout.slots.iter().map(|s| &s.id).collect();

        assert_eq!(
            ids.len(),
            layout.slots.len(),
            "duplicate ids break placement"
        );
    }
}
