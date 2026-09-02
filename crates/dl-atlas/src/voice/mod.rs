//! Voice: the wake word, the utterance, and what to do with what was said.
//!
//! Everything here is pure. The engines that actually hear and speak live in
//! `dl-voice` behind [`Backend`]; what stays in this crate is the part that can
//! be wrong in a way a user would notice — when to start recording, when to
//! stop, what a phrase means, and when to refuse.
//!
//! The through-line is that **voice has to be able to decline**. A keyboard
//! shows a list and waits for Enter; a microphone gets one pass at a phrase and
//! then acts. So each stage has an explicit way of doing nothing: silence is
//! not a command, a weak match is refused rather than run, a close call asks,
//! and a question that goes unanswered times out to *no* rather than yes.

pub mod assets;
pub mod resolve;
pub mod session;

pub use assets::{Capability, Engines, Missing, Trigger, VoiceAssets};
pub use resolve::Resolution;
pub use session::{Command, Phase, Session, Signal, Timings};
