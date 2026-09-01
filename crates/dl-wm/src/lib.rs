//! The slot engine.
//!
//! Pure logic over rectangles and identifiers — no `HWND`, no OS calls, no I/O.
//! That constraint is deliberate: it makes the rules that govern your workspace
//! unit-testable on Linux CI, and it is what allows the macOS port to be an
//! implementation of [`dl_platform::ShellIntegration`] rather than a rewrite.
//!
//! The engine decides *what should be where*. Actually moving windows is the
//! platform layer's job.
//!
//! A pass runs in four stages:
//!
//! 1. [`rules`] classifies each observed window — ignore, float, or tile.
//! 2. [`resolve`] assigns tiled windows to slots and collapses empty ones.
//! 3. [`display_change`] handles displays appearing and disappearing.
//! 4. [`reconcile`] diffs desired against observed and emits the minimum set of
//!    platform calls, with [`frame`] correcting for the invisible resize border.

pub mod coalesce;
pub mod display_change;
pub mod dock;
pub mod edit;
pub mod frame;
pub mod layouts;
pub mod reconcile;
pub mod resolve;
pub mod rules;
pub mod taskbar_guard;

pub use coalesce::{Coalescer, WindowEvent};
pub use display_change::{DisplayChange, DisplayChangeOutcome, WindowAction};
pub use dock::{build as build_dock, on_click};
pub use edit::{Axis, Edge, EditError};
pub use frame::{approximately_equal, compensate, visible_frame_of};
pub use layouts::{select, LayoutSource, SelectedLayout};
pub use reconcile::{reconcile, Operation, DEFAULT_TOLERANCE};
pub use resolve::{Placement, Resolver};
pub use rules::{Classification, IgnoreReason, Rules};
pub use taskbar_guard::{NextStart, RestoreReason, TaskbarState};
