//! macOS implementation, deferred to phase 10.
//!
//! Expect roughly 60% parity with Windows. Window management requires
//! Accessibility permissions the user must grant explicitly, there is no
//! AppBar equivalent for reserving screen edges, and GPU metrics come from
//! IOKit rather than PDH.

#[cfg(target_os = "macos")]
mod shell;

#[cfg(target_os = "macos")]
pub use shell::MacShell;
