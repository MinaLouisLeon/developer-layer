//! Selects the platform implementation at compile time.
//!
//! Every other module talks to `dyn ShellIntegration`, so nothing above this
//! file knows which operating system it is running on.

use dl_platform::ShellIntegration;

#[cfg(windows)]
pub fn shell() -> Box<dyn ShellIntegration> {
    Box::new(dl_platform_win::WindowsShell::new())
}

#[cfg(target_os = "macos")]
pub fn shell() -> Box<dyn ShellIntegration> {
    Box::new(dl_platform_mac::MacShell::new())
}

/// Linux is not a target for this project; the null shell exists so the
/// workspace still builds and the pure crates can be exercised in CI.
#[cfg(not(any(windows, target_os = "macos")))]
pub fn shell() -> Box<dyn ShellIntegration> {
    Box::new(dl_platform::NullShell)
}
