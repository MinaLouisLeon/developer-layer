//! Debouncing window events.
//!
//! `EVENT_OBJECT_LOCATIONCHANGE` fires continuously while a window is being
//! dragged or resized — hundreds of events per second. Running a pass per event
//! would fight the user mid-drag and peg a core.
//!
//! The policy encoded here: coalesce bursts behind a quiet period, but never
//! let a steady stream postpone a pass forever, and let structural events
//! (a window appearing or vanishing) through immediately because those change
//! what the grid contains rather than just where something sits.
//!
//! Pure logic over an injected clock, so the timing rules are tested rather
//! than eyeballed against a running desktop.

use std::time::Duration;

/// What happened to a window, from the shell's point of view.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowEvent {
    /// A window appeared, vanished, or was shown/hidden. Changes the set of
    /// windows the grid must accommodate.
    Structural,
    /// A window moved or resized. Frequent, and usually the user dragging.
    Geometry,
    /// Focus moved. Cheap, but should not by itself trigger a re-tile.
    Focus,
    /// The set of displays changed.
    Display,
}

impl WindowEvent {
    /// Whether this event must be acted on without waiting for quiet.
    ///
    /// A window that just opened should land in its slot immediately; making
    /// the user watch it sit in the wrong place for a debounce interval is the
    /// difference between the shell feeling instant and feeling laggy.
    fn is_urgent(self) -> bool {
        matches!(self, Self::Structural | Self::Display)
    }
}

/// Decides when a pass should run.
#[derive(Debug, Clone)]
pub struct Coalescer {
    /// Quiet period a burst must settle for before a pass runs.
    quiet: Duration,
    /// Longest a pass may be postponed by a continuous stream of events.
    max_delay: Duration,
    /// When the current pending burst started.
    burst_started: Option<u64>,
    /// When the most recent event arrived.
    last_event: Option<u64>,
    /// Set when an urgent event arrives mid-burst.
    urgent: bool,
}

impl Default for Coalescer {
    fn default() -> Self {
        Self::new(Duration::from_millis(80), Duration::from_millis(400))
    }
}

impl Coalescer {
    pub fn new(quiet: Duration, max_delay: Duration) -> Self {
        Self {
            quiet,
            max_delay,
            burst_started: None,
            last_event: None,
            urgent: false,
        }
    }

    /// Record an event at `now_ms`.
    pub fn record(&mut self, event: WindowEvent, now_ms: u64) {
        // Focus alone never re-tiles: nothing about the geometry changed, and
        // re-tiling on focus would make every click a layout pass.
        if event == WindowEvent::Focus {
            return;
        }

        if self.burst_started.is_none() {
            self.burst_started = Some(now_ms);
        }
        self.last_event = Some(now_ms);
        self.urgent |= event.is_urgent();
    }

    /// Whether a pass should run now, clearing the pending burst if so.
    pub fn should_run(&mut self, now_ms: u64) -> bool {
        let (Some(started), Some(last)) = (self.burst_started, self.last_event) else {
            return false;
        };

        let settled = now_ms.saturating_sub(last) >= self.quiet.as_millis() as u64;
        // Without this, dragging a window for ten seconds would postpone the
        // pass for ten seconds.
        let overdue = now_ms.saturating_sub(started) >= self.max_delay.as_millis() as u64;

        if self.urgent || settled || overdue {
            self.reset();
            true
        } else {
            false
        }
    }

    pub fn is_pending(&self) -> bool {
        self.burst_started.is_some()
    }

    fn reset(&mut self) {
        self.burst_started = None;
        self.last_event = None;
        self.urgent = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn coalescer() -> Coalescer {
        Coalescer::new(Duration::from_millis(80), Duration::from_millis(400))
    }

    #[test]
    fn nothing_pending_means_nothing_to_run() {
        assert!(!coalescer().should_run(1_000));
    }

    #[test]
    fn a_drag_does_not_trigger_a_pass_on_every_frame() {
        let mut c = coalescer();

        // 60fps of LOCATIONCHANGE for a third of a second.
        for frame in 0..20 {
            c.record(WindowEvent::Geometry, frame * 16);
            assert!(
                !c.should_run(frame * 16),
                "re-tiling mid-drag fights the user"
            );
        }
    }

    #[test]
    fn a_pass_runs_once_the_drag_settles() {
        let mut c = coalescer();
        c.record(WindowEvent::Geometry, 0);

        assert!(!c.should_run(50), "still within the quiet period");
        assert!(c.should_run(100), "80ms of quiet has passed");
        assert!(!c.should_run(200), "the burst was consumed");
    }

    #[test]
    fn a_continuous_stream_cannot_postpone_a_pass_forever() {
        let mut c = coalescer();

        // An app animating its own size would otherwise starve the engine.
        let mut ran = false;
        for frame in 0..40 {
            let t = frame * 16;
            c.record(WindowEvent::Geometry, t);
            if c.should_run(t) {
                ran = true;
                break;
            }
        }

        assert!(
            ran,
            "max_delay must force a pass during a continuous stream"
        );
    }

    #[test]
    fn a_window_opening_is_acted_on_immediately() {
        // Watching a new window sit in the wrong place for 80ms is the
        // difference between feeling instant and feeling laggy.
        let mut c = coalescer();
        c.record(WindowEvent::Structural, 0);

        assert!(c.should_run(0));
    }

    #[test]
    fn a_display_change_is_also_urgent() {
        let mut c = coalescer();
        c.record(WindowEvent::Display, 0);

        assert!(c.should_run(0));
    }

    #[test]
    fn an_urgent_event_mid_drag_flushes_the_whole_burst() {
        let mut c = coalescer();
        c.record(WindowEvent::Geometry, 0);
        c.record(WindowEvent::Geometry, 16);
        c.record(WindowEvent::Structural, 32);

        assert!(c.should_run(32));
        assert!(!c.is_pending());
    }

    #[test]
    fn focus_changes_alone_never_trigger_a_pass() {
        // Otherwise every click would run a layout pass.
        let mut c = coalescer();
        c.record(WindowEvent::Focus, 0);

        assert!(!c.is_pending());
        assert!(!c.should_run(1_000));
    }

    #[test]
    fn the_clock_going_backwards_does_not_panic() {
        // Monotonic clocks are not guaranteed across every code path.
        let mut c = coalescer();
        c.record(WindowEvent::Geometry, 1_000);

        assert!(!c.should_run(500));
    }
}
