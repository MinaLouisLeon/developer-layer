//! Speaking, through the speech synthesiser built into Windows.
//!
//! WinRT rather than a bundled voice: it is already installed, it follows
//! whatever voice and rate the user chose in Windows' own settings, and it
//! adds nothing to the download.

use windows::core::HSTRING;
use windows::Media::Core::MediaSource;
use windows::Media::Playback::MediaPlayer;
use windows::Media::SpeechSynthesis::SpeechSynthesizer;

use crate::{Result, Speaker, VoiceError};

pub struct WinRtVoice {
    synthesizer: SpeechSynthesizer,
    /// Held for the life of the voice rather than made per utterance: a player
    /// dropped while it is still playing cuts the audio off mid-word.
    player: MediaPlayer,
}

impl WinRtVoice {
    pub fn new() -> Result<Self> {
        let synthesizer = SpeechSynthesizer::new().map_err(|e| VoiceError::Speak(e.to_string()))?;
        let player = MediaPlayer::new().map_err(|e| VoiceError::Speak(e.to_string()))?;
        Ok(Self {
            synthesizer,
            player,
        })
    }
}

impl Speaker for WinRtVoice {
    fn say(&mut self, text: &str) -> Result<()> {
        if text.trim().is_empty() {
            return Ok(());
        }

        let stream = self
            .synthesizer
            .SynthesizeTextToStreamAsync(&HSTRING::from(text))
            // `join`, because synthesis is quick and this already runs on the
            // voice thread rather than on anything the user is waiting on.
            .and_then(|op| op.join())
            .map_err(|e| VoiceError::Speak(e.to_string()))?;

        let content_type = stream
            .ContentType()
            .map_err(|e| VoiceError::Speak(e.to_string()))?;

        let source = MediaSource::CreateFromStream(&stream, &content_type)
            .map_err(|e| VoiceError::Speak(e.to_string()))?;

        self.player
            .SetSource(&source)
            .map_err(|e| VoiceError::Speak(e.to_string()))?;

        // Returns as soon as playback starts. The session treats speaking as a
        // phase it leaves on a signal, so blocking here would freeze the voice
        // thread for the length of every reply — including the wake that is
        // meant to interrupt one.
        self.player
            .Play()
            .map_err(|e| VoiceError::Speak(e.to_string()))
    }
}
