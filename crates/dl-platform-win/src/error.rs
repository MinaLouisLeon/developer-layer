//! Error translation from `windows-rs` into platform errors.

use dl_platform::PlatformError;

/// Wrap a Win32 failure with the API that produced it.
///
/// The call name matters: most of these failures are silent misbehaviour
/// rather than crashes, so knowing which call failed is usually the whole
/// diagnosis.
pub fn last_error(api: &'static str, err: windows::core::Error) -> PlatformError {
    PlatformError::Shell(format!("{api} failed: {err}"))
}
