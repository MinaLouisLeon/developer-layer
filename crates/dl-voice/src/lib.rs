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
//! ## No wake word, yet
//!
//! [`WAKE_WORD`] is `false` and there is no engine behind it. The plan named
//! Picovoice's Porcupine, and it cannot be taken as a dependency as things
//! stand: it is not on crates.io — the `porcupine` crate there is an unrelated
//! Win32 wrapper — so it means a git dependency plus their native library,
//! which is neither MIT nor something to bundle without deciding to.
//!
//! Nothing is designed around its absence. [`dl_atlas::voice::Trigger`] still
//! has its variant, the capability model still reports what a wake word would
//! need, and push-to-talk — which needs no account and no third-party binary —
//! is what starts an utterance today. Adding the engine later is implementing
//! [`Ears::wake_word_active`] rather than reshaping anything.

/// Whether this build can listen for a wake word. See the module docs.
pub const WAKE_WORD: bool = false;

pub mod audio;

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
    #[error("not supported on this platform: {0}")]
    Unsupported(&'static str),
}

pub type Result<T> = std::result::Result<T, VoiceError>;

/// Listening: the microphone, and the wake word if one is configured.
///
/// Implementations push mono 16 kHz frames to the callback given at
/// construction, and report a wake separately — the session in `dl-atlas`
/// treats those as two different signals and must not have to infer one from
/// the other.
pub trait Ears: Send {
    /// Begin delivering frames. Idempotent.
    fn start(&mut self) -> Result<()>;
    /// Stop delivering frames. Idempotent, and safe to call when never started.
    fn stop(&mut self);
    /// Whether a wake word is actually being listened for, as opposed to
    /// push-to-talk being the only way in.
    fn wake_word_active(&self) -> bool;
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
    fn wake_word_active(&self) -> bool {
        false
    }
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
