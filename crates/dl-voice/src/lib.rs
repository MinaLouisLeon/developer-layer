//! The engines behind Atlas's voice.
//!
//! `dl-atlas::voice` decides *when* to listen and *what a phrase means*; this
//! crate does the hearing and the speaking. The split is the one the whole
//! workspace uses: policy is pure and tested, and the part that needs a
//! microphone is behind a trait.
//!
//! Three traits rather than one, because they are genuinely independent. A
//! machine can transcribe without a wake word, and it can listen without being
//! able to speak back.
//!
//! [`audio`] is the exception to the gating: the conversion rules are the part
//! most likely to be silently wrong, so they build and run everywhere.
//!
//! ## The wake word
//!
//! [`wake`] binds Picovoice's Porcupine directly rather than using their Rust
//! crate, which is not on crates.io and does not build as a git dependency —
//! see that module. Binding the C API means the engine is loaded at runtime,
//! so nothing of Picovoice's is committed here and the licence of their
//! binaries never touches this repository. The user's copy lives in their
//! config directory.
//!
//! It is still optional. Push-to-talk needs no account and no third-party
//! binary, so voice works fully without any of it, and the capability model
//! reports the wake word as one thing among several rather than as the way in.

/// Whether this build contains a wake-word engine.
///
/// Distinct from whether one is *usable*: that also needs an access key, a
/// keyword file and the runtime on disk, which is
/// [`dl_atlas::voice::assets::capability`]'s question.
pub const WAKE_WORD: bool = true;

pub mod audio;
pub mod install;
pub mod wake;

#[cfg(windows)]
mod capture;
#[cfg(windows)]
mod stt;
#[cfg(windows)]
mod tts;

#[cfg(windows)]
pub use capture::Microphone;
#[cfg(windows)]
pub use stt::Whisper;
#[cfg(windows)]
pub use tts::WinRtVoice;
pub use wake::{PorcupineEars, Runtime};

#[derive(Debug, thiserror::Error)]
pub enum VoiceError {
    #[error("no microphone is available: {0}")]
    NoInput(String),
    #[error("the microphone could not be opened: {0}")]
    Capture(String),
    #[error("the wake word engine failed: {0}")]
    Wake(String),
    #[error("transcription failed: {0}")]
    Transcribe(String),
    #[error("speech failed: {0}")]
    Speak(String),
    #[error("{0} is missing")]
    MissingAsset(String),
    #[error("{0}")]
    Install(String),
    #[error("not supported on this platform: {0}")]
    Unsupported(&'static str),
}

pub type Result<T> = std::result::Result<T, VoiceError>;

/// The microphone.
///
/// Capture only. Whether the frames it produces are being examined for a wake
/// word is [`wake::PorcupineEars`]'s business, and keeping the two apart is
/// what lets the same stream feed both the detector and the recording.
pub trait Ears: Send {
    /// Begin delivering frames. Idempotent.
    fn start(&mut self) -> Result<()>;
    /// Stop delivering frames. Idempotent, and safe to call when never started.
    fn stop(&mut self);
}

/// Turning captured audio into text.
pub trait Transcriber: Send {
    /// `samples` is mono 16 kHz, as [`audio::resample`] leaves it.
    fn transcribe(&mut self, samples: &[f32]) -> Result<String>;
    /// Drop the model and reclaim its memory. Loading again on the next call
    /// is the price, and it is the right one for a couple of hundred megabytes
    /// held for a feature used a few times an hour.
    fn unload(&mut self);
    /// Whether the model is resident right now.
    fn is_loaded(&self) -> bool;
}

/// Speaking.
pub trait Speaker: Send {
    fn say(&mut self, text: &str) -> Result<()>;
}

/// Stands in wherever the real engines are unavailable — another platform, or
/// a machine with none of the assets.
///
/// Every method refuses rather than silently succeeding, so a caller that
/// wired it up by accident finds out.
#[derive(Debug, Default)]
pub struct NullVoice;

impl Ears for NullVoice {
    fn start(&mut self) -> Result<()> {
        Err(VoiceError::Unsupported("listening is Windows-only for now"))
    }
    fn stop(&mut self) {}
}

impl Transcriber for NullVoice {
    fn transcribe(&mut self, _samples: &[f32]) -> Result<String> {
        Err(VoiceError::Unsupported(
            "transcription is Windows-only for now",
        ))
    }
    fn unload(&mut self) {}
    fn is_loaded(&self) -> bool {
        false
    }
}

impl Speaker for NullVoice {
    fn say(&mut self, _text: &str) -> Result<()> {
        Err(VoiceError::Unsupported("speech is Windows-only for now"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_null_engines_refuse_rather_than_pretending_to_work() {
        // Silently succeeding would give a session that listens forever and
        // transcribes empty strings, which looks like a hardware fault.
        let mut null = NullVoice;
        assert!(Ears::start(&mut null).is_err());
        assert!(null.transcribe(&[0.0]).is_err());
        assert!(null.say("hello").is_err());
        assert!(!null.is_loaded());
    }
}
