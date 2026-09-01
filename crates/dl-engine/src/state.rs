//! Engine state across passes.
//!
//! The platform reports whether a window is minimised, but not *why*. That
//! distinction is not recoverable after the fact and it drives the reconnect
//! rule — a window parked by a display disconnect comes back when the display
//! returns, while one the user minimised themselves stays down. So the engine
//! carries it, and every minimise site sets it deliberately.

use std::collections::HashMap;

use dl_core::{
    Config, DisplaySet, DockAction, DockEntry, DockWindow, MinimizeReason, Monitor, MonitorId,
    SlotId, SlotLayout, WindowId,
};
use dl_platform::ShellIntegration;
use dl_wm::coalesce::{Coalescer, WindowEvent};
use dl_wm::display_change::{self, DisplayChange, WindowAction};
use dl_wm::dock;
use dl_wm::edit::{self, Axis, Edge};
use dl_wm::layouts::{self, LayoutSource};

use crate::pass::{run_pass, PassReport};

#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("platform: {0}")]
    Platform(String),
    #[error("layout: {0}")]
    Edit(#[from] edit::EditError),
}

pub type Result<T> = std::result::Result<T, EngineError>;

pub struct Engine {
    shell: Box<dyn ShellIntegration>,
    config: Config,
    monitors: Vec<Monitor>,
    display_set: DisplaySet,
    layout: SlotLayout,
    layout_source: LayoutSource,
    /// Why each currently minimised window is minimised. Absent means visible.
    minimize_reasons: HashMap<WindowId, MinimizeReason>,
    coalescer: Coalescer,
    /// The window holding the foreground, tracked from WinEvent hooks. The
    /// dock's click semantics depend on it — clicking the focused window
    /// minimises rather than re-focuses.
    foreground: Option<WindowId>,
    /// Set when the layout has unsaved edits, so the caller knows to persist.
    dirty: bool,
    /// The guardian child, alive only while the native taskbar is hidden.
    guardian: Option<std::process::Child>,
}

/// Height reserved for the dock, in physical pixels.
const DOCK_THICKNESS: i32 = 64;

impl Engine {
    pub fn new(shell: Box<dyn ShellIntegration>, config: Config) -> Self {
        let monitors = shell.monitors().unwrap_or_default();
        let selected = layouts::select(&config, &monitors);

        Self {
            shell,
            display_set: DisplaySet::from_monitors(&monitors),
            layout: selected.layout,
            layout_source: selected.source,
            monitors,
            config,
            minimize_reasons: HashMap::new(),
            coalescer: Coalescer::default(),
            foreground: None,
            dirty: false,
            guardian: None,
        }
    }

    pub fn config(&self) -> &Config {
        &self.config
    }

    pub fn layout(&self) -> &SlotLayout {
        &self.layout
    }

    pub fn layout_source(&self) -> LayoutSource {
        self.layout_source
    }

    pub fn monitors(&self) -> &[Monitor] {
        &self.monitors
    }

    /// Whether the layout has edits not yet written to disk.
    pub fn is_dirty(&self) -> bool {
        self.dirty
    }

    /// Currently observed windows, straight from the platform.
    pub fn windows(&self) -> Result<Vec<dl_core::WindowAttributes>> {
        self.shell
            .windows()
            .map_err(|e| EngineError::Platform(e.to_string()))
    }

    /// Record a window event; the caller then asks [`Self::should_run`].
    pub fn observe(&mut self, event: WindowEvent, now_ms: u64) {
        self.coalescer.record(event, now_ms);
    }

    /// Whether enough has settled to justify a pass.
    pub fn should_run(&mut self, now_ms: u64) -> bool {
        self.coalescer.should_run(now_ms)
    }

    /// Re-enumerate displays and, if the set changed, swap layouts and apply
    /// the disconnect/reconnect rules.
    ///
    /// Returns `None` when the display set is unchanged, so callers can skip
    /// the work rather than re-tiling on every spurious `WM_DISPLAYCHANGE` —
    /// Windows sends those for resolution and refresh-rate changes too.
    pub fn sync_displays(&mut self) -> Result<Option<DisplaySummary>> {
        let monitors = self
            .shell
            .monitors()
            .map_err(|e| EngineError::Platform(e.to_string()))?;
        let set = DisplaySet::from_monitors(&monitors);

        if set == self.display_set {
            self.monitors = monitors;
            return Ok(None);
        }

        let selected = layouts::select(&self.config, &monitors);
        self.layout = selected.layout;
        self.layout_source = selected.source;
        self.monitors = monitors.clone();
        self.display_set = set;

        let windows = self.window_records()?;
        let outcome = display_change::apply(
            &DisplayChange { monitors },
            &self.layout,
            &windows,
            self.config.telemetry.preferred_monitor.as_ref(),
        );

        let mut summary = DisplaySummary {
            minimized: 0,
            restored: 0,
            placed: 0,
            telemetry_monitor: outcome.telemetry_monitor.clone(),
        };

        for action in outcome.actions {
            match action {
                WindowAction::Minimize { window, reason } => {
                    if self.shell.minimize_window(window).is_ok() {
                        // Recorded, not inferred: this is the fact the reconnect
                        // rule depends on and it cannot be recovered later.
                        self.minimize_reasons.insert(window, reason);
                        summary.minimized += 1;
                    }
                }
                WindowAction::Restore { window } => {
                    if self.shell.restore_window(window).is_ok() {
                        self.minimize_reasons.remove(&window);
                        summary.restored += 1;
                    }
                }
                WindowAction::Place(_) => summary.placed += 1,
            }
        }

        Ok(Some(summary))
    }

    /// Run one placement pass.
    pub fn pass(&mut self) -> Result<PassReport> {
        self.sync_minimize_reasons()?;
        run_pass(self.shell.as_ref(), &self.config, Some(&self.layout))
            .map_err(EngineError::Platform)
    }

    /// Reconcile our record of *why* windows are minimised with reality.
    ///
    /// A window the user minimised themselves shows up here as newly minimised
    /// with no recorded reason, so it is tagged [`MinimizeReason::User`] and
    /// will not be resurrected by a later reconnect. Windows that are no longer
    /// minimised drop out entirely.
    fn sync_minimize_reasons(&mut self) -> Result<()> {
        let observed = self
            .shell
            .windows()
            .map_err(|e| EngineError::Platform(e.to_string()))?;

        let mut still_minimized = HashMap::new();

        for window in &observed {
            if !window.is_minimized {
                continue;
            }
            let reason = self
                .minimize_reasons
                .get(&window.id)
                .copied()
                .unwrap_or(MinimizeReason::User);
            still_minimized.insert(window.id, reason);
        }

        self.minimize_reasons = still_minimized;
        Ok(())
    }

    /// Current windows as records, carrying their minimise reasons.
    fn window_records(&self) -> Result<Vec<dl_core::WindowRecord>> {
        let observed = self
            .shell
            .windows()
            .map_err(|e| EngineError::Platform(e.to_string()))?;

        Ok(observed
            .into_iter()
            .map(|w| dl_core::WindowRecord {
                id: w.id,
                app_id: None,
                title: w.title,
                monitor: None,
                slot: None,
                tile_mode: dl_core::TileMode::Tiled,
                minimized: if w.is_minimized {
                    Some(
                        self.minimize_reasons
                            .get(&w.id)
                            .copied()
                            .unwrap_or(MinimizeReason::User),
                    )
                } else {
                    None
                },
            })
            .collect())
    }

    /// Current dock entries: pinned apps plus anything else running.
    pub fn dock(&self) -> Result<Vec<DockEntry>> {
        let observed = self.windows()?;
        let rules = dl_wm::Rules::from_pinned(&self.config.pinned_apps);

        let mut windows = Vec::new();
        for w in &observed {
            // The dock lists what the grid manages, so a cloaked ghost or a
            // tool window is excluded here for the same reason it is there.
            let app = crate::pass::resolve_app(w, &self.config);
            if rules.classify(w, app.as_ref()).is_ignored() {
                continue;
            }

            windows.push((
                app,
                DockWindow {
                    id: w.id,
                    title: w.title.clone(),
                    minimized: w.is_minimized,
                },
            ));
        }

        Ok(dock::build(
            &self.config.pinned_apps,
            &windows,
            self.foreground,
        ))
    }

    /// Record which window holds the foreground, from a WinEvent hook.
    pub fn set_foreground(&mut self, window: Option<WindowId>) {
        self.foreground = window;
    }

    /// Perform the action a dock click implies, returning what was done.
    pub fn click_dock_entry(&mut self, entry: &DockEntry) -> Result<DockAction> {
        let action = dock::on_click(entry, self.foreground);

        match &action {
            DockAction::Focus(w) | DockAction::Cycle(w) => {
                self.shell
                    .focus_window(*w)
                    .map_err(|e| EngineError::Platform(e.to_string()))?;
            }
            DockAction::Minimize(w) => {
                self.shell
                    .minimize_window(*w)
                    .map_err(|e| EngineError::Platform(e.to_string()))?;
                // A dock click is the user minimising it, so it must not be
                // resurrected by a later display reconnect.
                self.minimize_reasons.insert(*w, MinimizeReason::User);
            }
            DockAction::RestoreAll(windows) => {
                for w in windows {
                    let _ = self.shell.restore_window(*w);
                    self.minimize_reasons.remove(w);
                }
            }
            // Launching is the caller's job: it needs dl-apps, which the engine
            // deliberately does not depend on.
            DockAction::Launch(_) | DockAction::Nothing => {}
        }

        Ok(action)
    }

    /// Turn native-taskbar replacement on or off.
    ///
    /// Order matters on the way in: the guardian must be running *before* the
    /// taskbar is hidden, or a hard kill in the window between the two leaves
    /// the user with no shell and nothing watching to put it back.
    pub fn set_taskbar_replacement(&mut self, enabled: bool) -> Result<()> {
        if enabled {
            self.start_guardian();
            self.shell
                .reserve_dock_space(dl_platform::DockEdge::Bottom, DOCK_THICKNESS)
                .map_err(|e| EngineError::Platform(e.to_string()))?;
            self.shell
                .set_native_taskbar_visible(false)
                .map_err(|e| EngineError::Platform(e.to_string()))?;
        } else {
            // Reverse order on the way out: put the shell back first, so a
            // failure releasing the AppBar still leaves a usable desktop.
            self.shell
                .set_native_taskbar_visible(true)
                .map_err(|e| EngineError::Platform(e.to_string()))?;
            let _ = self.shell.release_dock_space();
            self.stop_guardian();
        }

        self.config.general.replace_native_taskbar = enabled;
        Ok(())
    }

    fn start_guardian(&mut self) {
        // Inverted rather than an early return so the body is the only
        // platform-specific part; on non-Windows the cfg block vanishes and a
        // trailing `return` would be left behind.
        if self.guardian.is_none() {
            #[cfg(windows)]
            match dl_platform_win::spawn_guardian() {
                Ok(child) => self.guardian = Some(child),
                // Logged rather than fatal, but the caller should treat a
                // missing guardian as a reason not to hide: without it a hard
                // kill leaves no taskbar and no way back.
                Err(e) => tracing::error!("taskbar guardian did not start: {e}"),
            }
        }
    }

    fn stop_guardian(&mut self) {
        if let Some(mut child) = self.guardian.take() {
            // The guardian restores the taskbar when its parent exits, and the
            // parent is still alive here, so killing it directly is correct.
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    /// Replace the pinned application list, returning config for persistence.
    ///
    /// Slot bindings survive: they reference an `AppId`, not a path, so an app
    /// rediscovered at a new location keeps the slot it was assigned.
    pub fn set_pinned_apps(&mut self, apps: Vec<dl_core::PinnedApp>) -> &Config {
        self.config.pinned_apps = apps;
        &self.config
    }

    // ---- edit mode ----

    pub fn move_border(&mut self, slot: &SlotId, edge: Edge, delta: f32) -> Result<()> {
        edit::move_border(&mut self.layout, slot, edge, delta)?;
        self.dirty = true;
        Ok(())
    }

    pub fn split_slot(&mut self, slot: &SlotId, axis: Axis, new_id: SlotId) -> Result<()> {
        edit::split(&mut self.layout, slot, axis, new_id)?;
        self.dirty = true;
        Ok(())
    }

    pub fn remove_slot(&mut self, slot: &SlotId) -> Result<()> {
        edit::remove(&mut self.layout, slot)?;
        self.dirty = true;
        Ok(())
    }

    pub fn assign_app(&mut self, slot: &SlotId, app: Option<dl_core::AppId>) -> Result<()> {
        edit::assign_app(&mut self.layout, slot, app)?;
        self.dirty = true;
        Ok(())
    }

    /// Fold the working layout back into config so it can be persisted.
    ///
    /// A generated layout is saved under a name derived from the display set,
    /// so the arrangement you just built becomes the saved layout for exactly
    /// these displays rather than vanishing on the next reconnect.
    pub fn commit_layout(&mut self) -> &Config {
        if self.layout_source == LayoutSource::Generated {
            self.layout.name = format!("Layout {}", self.display_set.len());
        }
        self.layout.display_set = self.display_set.clone();

        match self
            .config
            .layouts
            .iter_mut()
            .find(|l| l.display_set == self.display_set)
        {
            Some(existing) => *existing = self.layout.clone(),
            None => self.config.layouts.push(self.layout.clone()),
        }

        if self.config.default_layout.is_none() {
            self.config.default_layout = Some(self.layout.name.clone());
        }

        self.layout_source = LayoutSource::Saved;
        self.dirty = false;
        &self.config
    }
}

/// What a display change did.
#[derive(Debug, Clone, PartialEq)]
pub struct DisplaySummary {
    pub minimized: u32,
    pub restored: u32,
    pub placed: u32,
    pub telemetry_monitor: Option<MonitorId>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use dl_core::{NormalizedRect, Rect, WindowAttributes};
    use dl_platform::{DockEdge, PlatformError, Result as PlatformResult};
    use std::sync::{Arc, Mutex};

    /// A scriptable shell that records what was asked of it.
    #[derive(Default)]
    struct FakeShell {
        monitors: Mutex<Vec<Monitor>>,
        windows: Mutex<Vec<WindowAttributes>>,
        minimized: Arc<Mutex<Vec<WindowId>>>,
        restored: Arc<Mutex<Vec<WindowId>>>,
    }

    impl ShellIntegration for FakeShell {
        fn monitors(&self) -> PlatformResult<Vec<Monitor>> {
            Ok(self.monitors.lock().unwrap().clone())
        }
        fn windows(&self) -> PlatformResult<Vec<WindowAttributes>> {
            Ok(self.windows.lock().unwrap().clone())
        }
        fn set_window_bounds(&self, _w: WindowId, _b: Rect) -> PlatformResult<()> {
            Ok(())
        }
        fn focus_window(&self, _w: WindowId) -> PlatformResult<()> {
            Ok(())
        }
        fn minimize_window(&self, w: WindowId) -> PlatformResult<()> {
            self.minimized.lock().unwrap().push(w);
            Ok(())
        }
        fn restore_window(&self, w: WindowId) -> PlatformResult<()> {
            self.restored.lock().unwrap().push(w);
            Ok(())
        }
        fn suppress_maximize(&self, _w: WindowId) -> PlatformResult<()> {
            Ok(())
        }
        fn reserve_dock_space(&self, _e: DockEdge, _t: i32) -> PlatformResult<()> {
            Err(PlatformError::Unsupported("test"))
        }
        fn release_dock_space(&self) -> PlatformResult<()> {
            Err(PlatformError::Unsupported("test"))
        }
        fn set_native_taskbar_visible(&self, _v: bool) -> PlatformResult<()> {
            Err(PlatformError::Unsupported("test"))
        }
    }

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

    fn window(id: u64, minimized: bool) -> WindowAttributes {
        WindowAttributes {
            id: WindowId(id),
            title: format!("w{id}"),
            class_name: "Chrome_WidgetWin_1".into(),
            executable: None,
            aumid: None,
            outer_bounds: Rect::new(0, 0, 800, 600),
            frame_bounds: Rect::new(0, 0, 800, 600),
            is_visible: !minimized,
            is_cloaked: false,
            is_tool_window: false,
            has_owner: false,
            is_resizable: true,
            is_minimized: minimized,
            is_maximized: false,
        }
    }

    fn engine_with(monitors: Vec<Monitor>, windows: Vec<WindowAttributes>) -> Engine {
        let shell = FakeShell {
            monitors: Mutex::new(monitors),
            windows: Mutex::new(windows),
            ..Default::default()
        };
        Engine::new(Box::new(shell), Config::default())
    }

    #[test]
    fn a_fresh_engine_generates_a_layout_covering_every_display() {
        let engine = engine_with(vec![monitor("a", true), monitor("b", false)], vec![]);

        assert_eq!(engine.layout_source(), LayoutSource::Generated);
        assert!(engine.layout().validate().is_empty());
        assert_eq!(engine.monitors().len(), 2);
    }

    #[test]
    fn an_unchanged_display_set_does_no_work() {
        // Windows sends WM_DISPLAYCHANGE for resolution and refresh-rate
        // changes too; re-tiling on each would be gratuitous.
        let mut engine = engine_with(vec![monitor("a", true)], vec![]);

        assert_eq!(engine.sync_displays().expect("sync"), None);
    }

    #[test]
    fn a_user_minimized_window_is_recorded_as_such() {
        let mut engine = engine_with(vec![monitor("a", true)], vec![window(1, true)]);

        engine.pass().expect("pass");

        assert_eq!(
            engine.minimize_reasons.get(&WindowId(1)),
            Some(&MinimizeReason::User),
            "a window minimised outside our control must not be treated as an orphan"
        );
    }

    #[test]
    fn restoring_a_window_clears_its_recorded_reason() {
        let shell = FakeShell {
            monitors: Mutex::new(vec![monitor("a", true)]),
            windows: Mutex::new(vec![window(1, true)]),
            ..Default::default()
        };
        let mut engine = Engine::new(Box::new(shell), Config::default());
        engine.pass().expect("first pass");
        assert!(engine.minimize_reasons.contains_key(&WindowId(1)));

        // The user restores it; the next pass observes it visible.
        engine.shell = Box::new(FakeShell {
            monitors: Mutex::new(vec![monitor("a", true)]),
            windows: Mutex::new(vec![window(1, false)]),
            ..Default::default()
        });
        engine.pass().expect("second pass");

        assert!(
            !engine.minimize_reasons.contains_key(&WindowId(1)),
            "stale reasons would resurrect windows the user never parked"
        );
    }

    #[test]
    fn committing_saves_the_layout_for_exactly_these_displays() {
        let mut engine = engine_with(vec![monitor("a", true), monitor("b", false)], vec![]);
        let set = engine.display_set.clone();

        let config = engine.commit_layout();

        assert_eq!(config.layouts.len(), 1);
        assert_eq!(config.layouts[0].display_set, set);
        assert!(config.default_layout.is_some());
        assert!(!engine.is_dirty());
    }

    #[test]
    fn committing_twice_replaces_rather_than_duplicates() {
        let mut engine = engine_with(vec![monitor("a", true)], vec![]);

        engine.commit_layout();
        let slot = engine.layout().slots[0].id.clone();
        engine.move_border(&slot, Edge::Right, 0.1).expect("resize");
        let config = engine.commit_layout();

        assert_eq!(
            config.layouts.len(),
            1,
            "a second commit for the same displays must overwrite, not stack up"
        );
    }

    #[test]
    fn editing_marks_the_layout_dirty_until_committed() {
        let mut engine = engine_with(vec![monitor("a", true)], vec![]);
        assert!(!engine.is_dirty());

        let slot = engine.layout().slots[0].id.clone();
        engine.move_border(&slot, Edge::Right, 0.1).expect("resize");

        assert!(engine.is_dirty());
        engine.commit_layout();
        assert!(!engine.is_dirty());
    }

    #[test]
    fn a_refused_edit_leaves_the_layout_clean() {
        let mut engine = engine_with(vec![monitor("a", true)], vec![]);
        let slot = engine.layout().slots[0].id.clone();

        // Far too large: would crush the neighbour.
        assert!(engine.move_border(&slot, Edge::Right, 0.9).is_err());

        assert!(
            !engine.is_dirty(),
            "a rejected edit must not mark unsaved changes"
        );
    }

    #[test]
    fn edits_survive_into_the_committed_config() {
        let mut engine = engine_with(vec![monitor("a", true)], vec![]);
        let slot = engine.layout().slots[0].id.clone();
        engine.move_border(&slot, Edge::Right, 0.2).expect("resize");

        let config = engine.commit_layout();
        let saved = &config.layouts[0];

        assert_eq!(
            saved.slot(&slot).expect("slot survived").bounds,
            NormalizedRect::new(0.0, 0.0, 0.7, 1.0)
        );
    }
}
