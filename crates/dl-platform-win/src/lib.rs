//! Windows implementation of [`dl_platform::ShellIntegration`].
//!
//! This is the only crate in the workspace permitted to touch an `HWND`.
//! Everything above it operates on plain rectangles, which is what keeps the
//! slot engine unit-testable on Linux CI.
//!
//! On non-Windows targets this crate compiles to an empty library so the
//! workspace builds anywhere.

#[cfg(windows)]
mod error;
#[cfg(windows)]
mod monitors;
#[cfg(windows)]
mod shell;
#[cfg(windows)]
mod windows_enum;

#[cfg(windows)]
pub use shell::WindowsShell;
