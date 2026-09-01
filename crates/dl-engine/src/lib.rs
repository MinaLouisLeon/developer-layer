//! Slot engine orchestration.
//!
//! Deliberately free of Tauri so the whole pipeline is testable on Linux CI;
//! `apps/desktop` only supplies a [`dl_platform::ShellIntegration`] and drives
//! [`Engine`].

pub mod pass;
pub mod state;

pub use pass::{run_pass, PassReport};
pub use state::{Engine, EngineError};
