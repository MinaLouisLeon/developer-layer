//! The slot engine.
//!
//! Pure logic over rectangles and identifiers — no `HWND`, no OS calls, no I/O.
//! That constraint is deliberate: it makes the rules that govern your workspace
//! unit-testable on Linux CI, and it is what allows the macOS port to be an
//! implementation of [`dl_platform::ShellIntegration`] rather than a rewrite.
//!
//! The engine decides *what should be where*. Actually moving windows is the
//! platform layer's job.

pub mod display_change;
pub mod resolve;

pub use display_change::{DisplayChange, DisplayChangeOutcome, WindowAction};
pub use resolve::{Placement, Resolver};
