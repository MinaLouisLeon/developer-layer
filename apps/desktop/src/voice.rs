//! The voice loop.
//!
//! One thread owns the microphone, the transcriber and the speaker, and drives
//! `dl_atlas::voice::Session` with what they report. It is a thread rather than
//! a task on the main loop because transcription blocks for a second or two,
//! and doing that on the thread that services the window would freeze the
//! shell every time somebody spoke.
//!
//! Nothing here decides anything. When to stop recording, what a phrase means,
//! whether to ask before acting — all of that is in `dl-atlas`, tested without
//! a microphone. This is the part that cannot be: opening a device, moving
//! samples, and turning [`Command`]s into calls.

use std::sync::mpsc::{Receiver, Sender};
use std::time::{Duration, Instant};

use dl_atlas::voice::{Command, Session, Signal, Timings};
use dl_atlas::{Context, Recents};
use dl_voice::{Speaker, Transcriber};
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::AppState;

/// How often the loop wakes when nothing is happening.
///
/// Fast enough that the silence cutoff lands within a frame of where it
/// should, slow enough to be invisible on a power graph.
const TICK: Duration = Duration::from_millis(50);

/// What the rest of the app asks the voice thread to do.
pub enum Request {
    /// Push-to-talk went down.
    Press,
    /// Push-to-talk came up.
    Release,
    /// Escape, or the bar was dismissed.
    Cancel,
    /// A confirmation was answered in the UI.
    Answer(bool),
    /// Voice was switched on or off.
    Enabled(bool),
    /// Time to stop.
    Shutdown,
}

/// What the UI is told, so the overlay can show what is happening.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceState {
    /// One of `idle`, `listening`, `thinking`, `asking`, `speaking`, `off`.
    pub phase: String,
    /// The last thing heard, or the question being asked.
    pub message: Option<String>,
}

/// Everything the loop needs to run.
pub struct VoiceLoop {
    app: AppHandle,
    session: Session,
    ears: Option<dl_voice::Microphone>,
    transcriber: Box<dyn Transcriber>,
    speaker: Option<Box<dyn Speaker>>,
    utterance: dl_voice::audio::Utterance,
    requests: Receiver<Request>,
    started: Instant,
}

impl VoiceLoop {
    /// Milliseconds since the loop started. A monotonic clock, so a system
    /// clock adjustment cannot make an utterance appear to run backwards.
    fn now_ms(&self) -> u64 {
        self.started.elapsed().as_millis() as u64
    }

    fn run(mut self) {
        loop {
            // Requests first: a cancel that arrives while audio is queued
            // should take effect before the audio does.
            while let Ok(request) = self.requests.try_recv() {
                match request {
                    Request::Shutdown => {
                        // Through the session rather than by dropping out, so
                        // the microphone is closed and the model released the
                        // same way as any other disable.
                        self.signal(Signal::Disable);
                        return;
                    }
                    Request::Press => {
                        let now = self.now_ms();
                        let commands = self.session.press_to_talk(now);
                        self.apply(commands);
                    }
                    Request::Release => self.signal(Signal::Release),
                    Request::Cancel => self.signal(Signal::Cancel),
                    Request::Answer(yes) => self.signal(Signal::Answer(yes)),
                    Request::Enabled(true) => self.signal(Signal::Enable),
                    Request::Enabled(false) => self.signal(Signal::Disable),
                }
            }

            self.pump_audio();
            self.signal(Signal::Tick);
            self.publish();

            std::thread::sleep(TICK);
        }
    }

    fn signal(&mut self, signal: Signal) {
        let now = self.now_ms();
        let commands = self.session.handle(signal, now);
        self.apply(commands);
    }

    /// Move whatever the microphone captured into the utterance, and tell the
    /// session how loud it was.
    fn pump_audio(&mut self) {
        let Some(ears) = &self.ears else { return };
        if !self.session.phase().wants_audio() {
            return;
        }

        for frame in ears.drain() {
            self.utterance.push(&frame.samples);
            // One signal per frame rather than a summary: the session's
            // silence rule is written against frames, and collapsing them
            // would move the cutoff by however long the queue happened to be.
            let now = self.now_ms();
            let commands = self
                .session
                .handle(Signal::Audio { level: frame.peak }, now);
            self.apply(commands);
        }
    }

    fn apply(&mut self, commands: Vec<Command>) {
        for command in commands {
            match command {
                Command::StartCapture => {
                    self.utterance.clear();
                    if let Some(ears) = &mut self.ears {
                        if let Err(e) = dl_voice::Ears::start(ears) {
                            tracing::error!(%e, "the microphone did not open");
                            self.signal_now(Signal::Cancel);
                        }
                    }
                }
                Command::AbandonCapture => {
                    self.stop_ears();
                    self.utterance.clear();
                }
                Command::Transcribe => {
                    self.stop_ears();
                    self.transcribe();
                }
                Command::Say(text) => self.say(&text),
                Command::Run(invocation) => self.execute(invocation),
                Command::UnloadModel => self.transcriber.unload(),
            }
        }
    }

    /// Re-enter the session without recursing through `apply`.
    fn signal_now(&mut self, signal: Signal) {
        let now = self.now_ms();
        let commands = self.session.handle(signal, now);
        // One level only. A command that produced another command that
        // produced a third would be a loop, and none of the transitions in
        // `dl-atlas` do that.
        for command in commands {
            if let Command::AbandonCapture = command {
                self.stop_ears();
                self.utterance.clear();
            }
        }
    }

    fn stop_ears(&mut self) {
        if let Some(ears) = &mut self.ears {
            dl_voice::Ears::stop(ears);
        }
    }

    fn transcribe(&mut self) {
        let samples = self.utterance.take();
        let now = self.now_ms();

        // Blocks for a second or two. That is the whole reason this is its own
        // thread.
        let signal = match self.transcriber.transcribe(&samples) {
            Ok(text) if text.trim().is_empty() => Signal::Transcript(String::new()),
            Ok(text) => Signal::Transcript(text),
            Err(e) => {
                tracing::warn!(%e, "transcription failed");
                Signal::TranscriptFailed("I could not make that out.".into())
            }
        };

        // The session hands a transcript straight back rather than resolving
        // it, because resolution needs the live palette. That lookup happens
        // here and the answer goes back in through `resolved`.
        if let Signal::Transcript(text) = &signal {
            let resolution = self.resolve(text);
            let commands = self.session.resolved(resolution, now);
            self.apply(commands);
        } else {
            let commands = self.session.handle(signal, now);
            self.apply(commands);
        }
    }

    fn resolve(&self, transcript: &str) -> dl_atlas::Resolution {
        let Some(state) = self.app.try_state::<AppState>() else {
            return dl_atlas::Resolution::Unclear {
                heard: transcript.to_string(),
            };
        };
        let Ok(engine) = state.engine().lock() else {
            return dl_atlas::Resolution::Unclear {
                heard: transcript.to_string(),
            };
        };

        let dock = engine.dock().unwrap_or_default();
        let config = engine.config().clone();
        let entries = dl_atlas::palette::build(&Context {
            installed: &config.pinned_apps,
            dock: &dock,
            taskbar_hidden: config.general.replace_native_taskbar,
        });

        let recents = state
            .recents()
            .lock()
            .map(|r| r.clone())
            .unwrap_or_else(|_| Recents::default());

        dl_atlas::voice::resolve::resolve(transcript, &entries, &recents)
    }

    fn say(&mut self, text: &str) {
        // Always shown, only sometimes spoken. A shell that talks unprompted
        // is one people switch off entirely, so the text is the reply and the
        // voice is the option.
        let _ = self.app.emit(
            "atlas:voice",
            VoiceState {
                phase: "speaking".into(),
                message: Some(text.to_string()),
            },
        );

        if let Some(speaker) = &mut self.speaker {
            if let Err(e) = speaker.say(text) {
                tracing::warn!(%e, "could not speak");
            }
        }
        // Nothing reports when playback finishes, so the phase is released
        // immediately rather than being held on a promise that may not arrive.
        // A wake during a reply interrupts it either way.
        let now = self.now_ms();
        let commands = self.session.handle(Signal::SpokenDone, now);
        self.apply(commands);
    }

    fn execute(&mut self, invocation: dl_atlas::Invocation) {
        let key = invocation.key();
        tracing::info!(%key, "running a spoken command");
        if let Err(e) = crate::atlas::run_key(&self.app, &key) {
            tracing::warn!(%e, %key, "the spoken command failed");
            self.say(&e);
        }
    }

    fn publish(&self) {
        let (phase, message) = match self.session.phase() {
            dl_atlas::voice::Phase::Off => ("off", None),
            dl_atlas::voice::Phase::Armed => ("idle", None),
            dl_atlas::voice::Phase::Listening { .. } => ("listening", None),
            dl_atlas::voice::Phase::Transcribing { .. } => ("thinking", None),
            dl_atlas::voice::Phase::Confirming { prompt, .. } => ("asking", Some(prompt.clone())),
            dl_atlas::voice::Phase::Speaking { .. } => ("speaking", None),
        };

        let _ = self.app.emit(
            "atlas:voice",
            VoiceState {
                phase: phase.into(),
                message,
            },
        );
    }
}

/// The inbox for the voice thread.
///
/// Made before the Tauri builder, because `AppState` needs the sending half
/// and the thread needs an `AppHandle` that only exists once the app is set
/// up. Splitting it this way avoids an `Option` on the state for the whole
/// life of the process.
pub fn channel() -> (Sender<Request>, Receiver<Request>) {
    std::sync::mpsc::channel()
}

/// What voice can do as configured, without starting anything.
pub fn capability(config: &dl_core::AtlasConfig) -> dl_atlas::Capability {
    let assets = dl_atlas::VoiceAssets {
        access_key: config.picovoice_key.clone(),
        keyword: config.wake_word.clone(),
        model: config.voice_model.clone(),
    };

    let engines = dl_atlas::voice::assets::Engines {
        wake_word: dl_voice::WAKE_WORD,
        transcription: cfg!(windows),
    };

    dl_atlas::voice::assets::capability(&assets, engines, &|path| path.is_file())
}

/// Start the voice thread, if voice is switched on and possible.
///
/// Never fatal. A missing model, a microphone in use by something else, a
/// machine with no input at all — none of those is a reason for a shell to
/// refuse to start, so each is logged with what to do about it and everything
/// else carries on. The receiver is dropped either way, so a UI that sends a
/// request to a thread that never started gets a clean error rather than
/// blocking.
pub fn start(app: AppHandle, config: &dl_core::AtlasConfig, requests: Receiver<Request>) {
    if !config.voice_enabled {
        tracing::info!("voice is switched off in the config");
        return;
    }

    let capability = capability(config);
    if !capability.usable {
        for gap in &capability.missing {
            tracing::warn!(what = %gap.what, remedy = %gap.remedy, "voice is unavailable");
        }
        return;
    }

    let Some(model) = config.voice_model.clone() else {
        return;
    };
    let speak = config.speak_replies;

    let spawned = std::thread::Builder::new()
        .name("dl-voice".into())
        .spawn(move || match build(app, model, speak, requests) {
            Ok(voice) => voice.run(),
            Err(e) => tracing::error!(%e, "the voice thread could not start"),
        });

    if let Err(e) = spawned {
        tracing::error!(%e, "the voice thread could not be spawned");
    }
}

#[cfg(windows)]
fn build(
    app: AppHandle,
    model: std::path::PathBuf,
    speak: bool,
    requests: Receiver<Request>,
) -> Result<VoiceLoop, dl_voice::VoiceError> {
    let mut session = Session::new(Timings::default());
    session.handle(Signal::Enable, 0);

    let speaker: Option<Box<dyn Speaker>> = if speak {
        match dl_voice::WinRtVoice::new() {
            Ok(voice) => Some(Box::new(voice)),
            Err(e) => {
                // Not fatal: replies are still shown, just not spoken.
                tracing::warn!(%e, "speech synthesis is unavailable");
                None
            }
        }
    } else {
        None
    };

    Ok(VoiceLoop {
        app,
        session,
        ears: Some(dl_voice::Microphone::open()?),
        transcriber: Box::new(dl_voice::Whisper::new(model)?),
        speaker,
        // Comfortably longer than the session's own ceiling, so the buffer is
        // a backstop against a stalled consumer rather than something that
        // trims ordinary utterances.
        utterance: dl_voice::audio::Utterance::with_seconds(30),
        requests,
        started: Instant::now(),
    })
}

#[cfg(not(windows))]
fn build(
    _app: AppHandle,
    _model: std::path::PathBuf,
    _speak: bool,
    _requests: Receiver<Request>,
) -> Result<VoiceLoop, dl_voice::VoiceError> {
    Err(dl_voice::VoiceError::Unsupported(
        "voice runs on Windows for now",
    ))
}
