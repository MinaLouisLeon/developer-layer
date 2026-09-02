//! The voice session, as a state machine over an injected clock.
//!
//! Timing *is* the behaviour here. When recording stops, how long a question
//! waits, when a two-hundred-megabyte model is dropped — get any of them wrong
//! and voice feels broken in a way no unit of it is individually wrong. So the
//! clock is a parameter, exactly as it is in `dl-wm::coalesce`, and every one
//! of those decisions is a test rather than something eyeballed on a running
//! desktop with a microphone.
//!
//! The machine takes [`Signal`]s and answers with [`Command`]s. It touches no
//! audio device and holds no model; the backend does that, and does only what
//! it is told.

use crate::Invocation;

/// Where a session is.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Phase {
    /// Voice is off, or nothing it needs is available.
    Off,
    /// Waiting to be woken.
    Armed,
    /// Recording.
    Listening {
        /// When recording started.
        started_ms: u64,
        /// The last moment anything above the noise floor arrived. Equal to
        /// `started_ms` until something is heard.
        last_voice_ms: u64,
        /// Whether anything above the noise floor has arrived at all.
        heard_anything: bool,
    },
    /// The recording is with the transcriber.
    Transcribing { started_ms: u64 },
    /// Waiting for a yes or a no.
    Confirming {
        invocation: Invocation,
        prompt: String,
        asked_ms: u64,
    },
    /// Saying something back.
    Speaking { started_ms: u64 },
}

impl Phase {
    pub fn is_listening(&self) -> bool {
        matches!(self, Phase::Listening { .. })
    }

    /// Whether the microphone should be open. Used by the backend to keep the
    /// capture stream and the phase in agreement after any transition.
    pub fn wants_audio(&self) -> bool {
        self.is_listening()
    }
}

/// Something that happened.
#[derive(Debug, Clone, PartialEq)]
pub enum Signal {
    /// Voice became available, or was switched on.
    Enable,
    /// Voice was switched off, or its assets went away.
    Disable,
    /// The wake word fired, or push-to-talk was pressed.
    Wake,
    /// Push-to-talk was released. Ignored for a wake-word utterance, which has
    /// no release to wait for.
    Release,
    /// A captured frame, summarised. `level` is peak amplitude, 0.0 to 1.0.
    Audio { level: f32 },
    /// The transcriber answered.
    Transcript(String),
    /// The transcriber failed.
    TranscriptFailed(String),
    /// A question was answered.
    Answer(bool),
    /// Finished saying something.
    SpokenDone,
    /// Escape, or the bar was dismissed.
    Cancel,
    /// Time passed and nothing else happened.
    Tick,
}

/// Something the backend should do.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Command {
    /// Open the microphone and start buffering.
    StartCapture,
    /// Stop buffering and discard what was captured.
    AbandonCapture,
    /// Stop buffering and transcribe what was captured.
    Transcribe,
    /// Say something. Not a status line — this is spoken aloud.
    Say(String),
    /// Run it.
    Run(Invocation),
    /// Drop the transcription model to reclaim its memory.
    UnloadModel,
}

/// Every duration the machine decides with.
///
/// Grouped so the defaults can be read together and compared, because the
/// interesting thing about them is their relative size.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Timings {
    /// Silence that ends an utterance, once something has been said.
    ///
    /// Long enough to survive the pause in "open… Slack", short enough that
    /// the user is not left wondering whether it heard them.
    pub silence_ms: u64,
    /// How long to wait for the user to start speaking at all before giving
    /// up. Covers a wake word that fired on the television.
    pub no_speech_ms: u64,
    /// A hard ceiling on one utterance, so a stuck noise floor cannot record
    /// until the disk fills.
    pub max_utterance_ms: u64,
    /// How long the transcriber gets before it counts as failed.
    pub transcribe_timeout_ms: u64,
    /// How long a question waits. It times out to **no**.
    pub confirm_timeout_ms: u64,
    /// Idle time after which the transcription model is dropped. It costs a
    /// couple of hundred megabytes resident, which is a lot to hold for a
    /// feature used a few times an hour.
    pub idle_unload_ms: u64,
}

impl Default for Timings {
    fn default() -> Self {
        Self {
            silence_ms: 900,
            no_speech_ms: 3_000,
            max_utterance_ms: 15_000,
            transcribe_timeout_ms: 20_000,
            confirm_timeout_ms: 8_000,
            idle_unload_ms: 5 * 60_000,
        }
    }
}

/// Anything at or below this is silence.
///
/// Peak amplitude rather than RMS: a single loud sample is speech starting,
/// and averaging would smear the onset across the window that decides whether
/// recording has begun.
pub const NOISE_FLOOR: f32 = 0.02;

/// A voice session.
#[derive(Debug, Clone)]
pub struct Session {
    phase: Phase,
    timings: Timings,
    /// When the model was last used, for the idle unload. `None` once it is
    /// unloaded, or before it has ever been loaded.
    model_used_ms: Option<u64>,
    /// Whether this utterance was started by a held key. A wake-word utterance
    /// ends on silence; a held one ends when the key comes up, because the
    /// user has said explicitly when they are done.
    held: bool,
}

impl Session {
    pub fn new(timings: Timings) -> Self {
        Self {
            phase: Phase::Off,
            timings,
            model_used_ms: None,
            held: false,
        }
    }

    pub fn phase(&self) -> &Phase {
        &self.phase
    }

    pub fn timings(&self) -> Timings {
        self.timings
    }

    /// Feed one signal, at `now_ms`, and collect what to do about it.
    pub fn handle(&mut self, signal: Signal, now_ms: u64) -> Vec<Command> {
        // Cancel and Disable cut across every phase, so they are handled once
        // rather than in each arm — a missed arm would be a session stuck with
        // the microphone open.
        match &signal {
            Signal::Disable => {
                let mut commands = self.abandon();
                self.phase = Phase::Off;
                commands.extend(self.unload_if_loaded());
                return commands;
            }
            Signal::Cancel => {
                let commands = self.abandon();
                if !matches!(self.phase, Phase::Off) {
                    self.phase = Phase::Armed;
                }
                return commands;
            }
            _ => {}
        }

        match (&self.phase, signal) {
            (Phase::Off, Signal::Enable) => {
                self.phase = Phase::Armed;
                Vec::new()
            }
            // Everything else while off is ignored rather than queued: a wake
            // that arrives as voice is switched off should not fire later.
            (Phase::Off, _) => Vec::new(),

            (Phase::Armed, Signal::Wake) => {
                self.held = false;
                self.start_listening(now_ms);
                vec![Command::StartCapture]
            }
            (Phase::Armed, Signal::Tick) => self.unload_if_idle(now_ms),

            (Phase::Listening { .. }, Signal::Audio { level }) => {
                self.note_audio(level, now_ms);
                self.check_listening(now_ms)
            }
            (Phase::Listening { .. }, Signal::Release) => {
                // A held key coming up is the user saying they are done, which
                // is more certain than any silence heuristic.
                self.held = false;
                self.finish_listening(now_ms)
            }
            (Phase::Listening { .. }, Signal::Tick) => self.check_listening(now_ms),
            // A second wake while already recording is a double-press or the
            // wake word inside the utterance. Neither should restart anything.
            (Phase::Listening { .. }, Signal::Wake) => Vec::new(),

            (Phase::Transcribing { .. }, Signal::Transcript(text)) => {
                self.model_used_ms = Some(now_ms);
                self.phase = Phase::Armed;
                // Resolution is the caller's: it needs the live palette, which
                // this machine deliberately knows nothing about.
                vec![Command::Say(text)]
            }
            (Phase::Transcribing { .. }, Signal::TranscriptFailed(why)) => {
                self.phase = Phase::Armed;
                vec![Command::Say(why)]
            }
            (Phase::Transcribing { started_ms }, Signal::Tick) => {
                if now_ms.saturating_sub(*started_ms) >= self.timings.transcribe_timeout_ms {
                    self.phase = Phase::Armed;
                    vec![Command::Say("I could not make that out in time.".into())]
                } else {
                    Vec::new()
                }
            }

            (Phase::Confirming { invocation, .. }, Signal::Answer(true)) => {
                let invocation = invocation.clone();
                self.phase = Phase::Armed;
                vec![Command::Run(invocation)]
            }
            (Phase::Confirming { .. }, Signal::Answer(false)) => {
                self.phase = Phase::Armed;
                Vec::new()
            }
            (Phase::Confirming { asked_ms, .. }, Signal::Tick) => {
                if now_ms.saturating_sub(*asked_ms) >= self.timings.confirm_timeout_ms {
                    // To **no**. A question nobody answered is not consent, and
                    // the only action that asks is the one that cannot be undone.
                    self.phase = Phase::Armed;
                    Vec::new()
                } else {
                    Vec::new()
                }
            }

            (Phase::Speaking { .. }, Signal::SpokenDone) => {
                self.phase = Phase::Armed;
                Vec::new()
            }
            // A wake while Atlas is talking interrupts it, rather than being
            // dropped — otherwise a long reply locks the user out.
            (Phase::Speaking { .. }, Signal::Wake) => {
                self.held = false;
                self.start_listening(now_ms);
                vec![Command::StartCapture]
            }

            _ => Vec::new(),
        }
    }

    /// Start a push-to-talk utterance, which ends on release rather than on
    /// silence.
    pub fn press_to_talk(&mut self, now_ms: u64) -> Vec<Command> {
        if matches!(self.phase, Phase::Off) {
            return Vec::new();
        }
        let commands = self.handle(Signal::Wake, now_ms);
        if self.phase.is_listening() {
            self.held = true;
        }
        commands
    }

    /// What the caller decided a transcript meant.
    ///
    /// Separate from [`Self::handle`] because resolution needs the live
    /// palette, and a state machine that reached for one would stop being
    /// testable without a workspace.
    pub fn resolved(&mut self, resolution: crate::Resolution, now_ms: u64) -> Vec<Command> {
        match resolution {
            crate::Resolution::Run(invocation) => {
                self.phase = Phase::Armed;
                vec![Command::Run(invocation)]
            }
            crate::Resolution::Confirm { invocation, prompt } => {
                self.phase = Phase::Confirming {
                    invocation,
                    prompt: prompt.clone(),
                    asked_ms: now_ms,
                };
                vec![Command::Say(prompt)]
            }
            crate::Resolution::Unclear { heard } => {
                self.phase = Phase::Armed;
                // Quoted back, so the user learns whether the microphone or
                // the phrasing was the problem.
                vec![Command::Say(format!(
                    "I heard “{heard}”, which is not a command I know."
                ))]
            }
            crate::Resolution::Silence => {
                self.phase = Phase::Armed;
                Vec::new()
            }
        }
    }

    /// Note that something is being said aloud, so a wake can interrupt it.
    pub fn speaking(&mut self, now_ms: u64) {
        self.phase = Phase::Speaking { started_ms: now_ms };
    }

    fn start_listening(&mut self, now_ms: u64) {
        self.phase = Phase::Listening {
            started_ms: now_ms,
            last_voice_ms: now_ms,
            heard_anything: false,
        };
    }

    fn note_audio(&mut self, level: f32, now_ms: u64) {
        if let Phase::Listening {
            last_voice_ms,
            heard_anything,
            ..
        } = &mut self.phase
        {
            if level > NOISE_FLOOR {
                *last_voice_ms = now_ms;
                *heard_anything = true;
            }
        }
    }

    /// Decide whether this utterance is over.
    fn check_listening(&mut self, now_ms: u64) -> Vec<Command> {
        let Phase::Listening {
            started_ms,
            last_voice_ms,
            heard_anything,
        } = self.phase
        else {
            return Vec::new();
        };

        // A held key ends on release, full stop. Cutting a held utterance off
        // at a pause would be the machine overruling something the user is
        // saying explicitly with their finger.
        if self.held {
            if now_ms.saturating_sub(started_ms) >= self.timings.max_utterance_ms {
                return self.finish_listening(now_ms);
            }
            return Vec::new();
        }

        if now_ms.saturating_sub(started_ms) >= self.timings.max_utterance_ms {
            return self.finish_listening(now_ms);
        }

        if !heard_anything {
            // Nothing was ever said. A wake word that fired on the television,
            // most likely, so this ends quietly rather than announcing itself.
            if now_ms.saturating_sub(started_ms) >= self.timings.no_speech_ms {
                self.phase = Phase::Armed;
                return vec![Command::AbandonCapture];
            }
            return Vec::new();
        }

        if now_ms.saturating_sub(last_voice_ms) >= self.timings.silence_ms {
            return self.finish_listening(now_ms);
        }

        Vec::new()
    }

    fn finish_listening(&mut self, now_ms: u64) -> Vec<Command> {
        let Phase::Listening { heard_anything, .. } = self.phase else {
            return Vec::new();
        };

        if !heard_anything {
            self.phase = Phase::Armed;
            return vec![Command::AbandonCapture];
        }

        self.phase = Phase::Transcribing { started_ms: now_ms };
        self.model_used_ms = Some(now_ms);
        vec![Command::Transcribe]
    }

    /// Stop the microphone if it is open, whatever phase we were in.
    fn abandon(&mut self) -> Vec<Command> {
        if self.phase.wants_audio() {
            vec![Command::AbandonCapture]
        } else {
            Vec::new()
        }
    }

    fn unload_if_idle(&mut self, now_ms: u64) -> Vec<Command> {
        match self.model_used_ms {
            Some(used) if now_ms.saturating_sub(used) >= self.timings.idle_unload_ms => {
                self.model_used_ms = None;
                vec![Command::UnloadModel]
            }
            _ => Vec::new(),
        }
    }

    fn unload_if_loaded(&mut self) -> Vec<Command> {
        if self.model_used_ms.take().is_some() {
            vec![Command::UnloadModel]
        } else {
            Vec::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::action;

    const LOUD: f32 = 0.4;
    const QUIET: f32 = 0.0;

    fn session() -> Session {
        let mut session = Session::new(Timings::default());
        session.handle(Signal::Enable, 0);
        session
    }

    /// Feed `ms` of silence in 100 ms steps from `from`, collecting commands.
    fn silence(session: &mut Session, from: u64, ms: u64) -> Vec<Command> {
        let mut out = Vec::new();
        let mut t = from;
        while t < from + ms {
            t += 100;
            out.extend(session.handle(Signal::Audio { level: QUIET }, t));
        }
        out
    }

    #[test]
    fn a_wake_opens_the_microphone() {
        let mut session = session();
        assert_eq!(session.handle(Signal::Wake, 1_000), [Command::StartCapture]);
        assert!(session.phase().is_listening());
    }

    #[test]
    fn an_utterance_ends_after_a_pause_and_goes_to_the_transcriber() {
        let mut session = session();
        session.handle(Signal::Wake, 0);
        session.handle(Signal::Audio { level: LOUD }, 500);

        // Not yet: the pause in "open… Slack" is shorter than the cutoff.
        assert!(silence(&mut session, 500, 500).is_empty());
        assert!(session.phase().is_listening());

        let commands = silence(&mut session, 1_000, 600);
        assert_eq!(commands, [Command::Transcribe]);
        assert!(matches!(session.phase(), Phase::Transcribing { .. }));
    }

    #[test]
    fn a_wake_that_nobody_followed_up_gives_up_quietly() {
        // The wake word firing on the television is routine. Announcing it
        // every time would make a false trigger worse than the trigger.
        let mut session = session();
        session.handle(Signal::Wake, 0);

        let commands = silence(&mut session, 0, Timings::default().no_speech_ms + 100);
        assert_eq!(commands, [Command::AbandonCapture]);
        assert_eq!(session.phase(), &Phase::Armed);
    }

    #[test]
    fn a_stuck_noise_floor_cannot_record_forever() {
        // Somebody's fan, or a microphone that reports a DC offset, would
        // otherwise hold `last_voice_ms` at now and never reach the silence
        // cutoff.
        let mut session = session();
        session.handle(Signal::Wake, 0);

        let mut t = 0;
        let mut commands = Vec::new();
        while t < Timings::default().max_utterance_ms + 500 && commands.is_empty() {
            t += 100;
            commands = session.handle(Signal::Audio { level: LOUD }, t);
        }

        assert_eq!(commands, [Command::Transcribe]);
        assert!(
            t <= Timings::default().max_utterance_ms + 200,
            "ran to {t}ms"
        );
    }

    #[test]
    fn a_held_key_ends_the_utterance_when_it_comes_up_not_at_a_pause() {
        // The user is saying explicitly when they are done. Cutting them off
        // mid-thought because they paused would be the machine overruling that.
        let mut session = session();
        session.press_to_talk(0);
        session.handle(Signal::Audio { level: LOUD }, 200);

        // Far longer than the silence cutoff, and still recording.
        assert!(silence(&mut session, 200, 3_000).is_empty());
        assert!(session.phase().is_listening());

        assert_eq!(
            session.handle(Signal::Release, 3_300),
            [Command::Transcribe]
        );
    }

    #[test]
    fn a_held_key_still_obeys_the_hard_ceiling() {
        // A key that never comes up — the window lost focus mid-press — must
        // not record until the disk fills.
        let mut session = session();
        session.press_to_talk(0);
        session.handle(Signal::Audio { level: LOUD }, 100);

        let commands = session.handle(Signal::Tick, Timings::default().max_utterance_ms + 1);
        assert_eq!(commands, [Command::Transcribe]);
    }

    #[test]
    fn releasing_without_having_said_anything_transcribes_nothing() {
        // A stray key press. Sending an empty recording to a two-hundred-
        // megabyte model to be told it is empty is pure waste.
        let mut session = session();
        session.press_to_talk(0);
        assert_eq!(
            session.handle(Signal::Release, 300),
            [Command::AbandonCapture]
        );
        assert_eq!(session.phase(), &Phase::Armed);
    }

    #[test]
    fn a_second_wake_while_recording_does_not_restart_the_utterance() {
        // A double-press, or the wake word occurring inside what was said.
        let mut session = session();
        session.handle(Signal::Wake, 0);
        session.handle(Signal::Audio { level: LOUD }, 200);

        assert!(session.handle(Signal::Wake, 400).is_empty());
        match session.phase() {
            Phase::Listening { started_ms, .. } => assert_eq!(*started_ms, 0),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn a_question_that_goes_unanswered_times_out_to_no() {
        // The only action that asks is the one that cannot be undone. Treating
        // silence as consent would be exactly backwards.
        let mut session = session();
        session.resolved(
            crate::Resolution::Confirm {
                invocation: crate::Invocation::bare(action::SHELL_QUIT),
                prompt: "Quit Developer Layer?".into(),
            },
            1_000,
        );
        assert!(matches!(session.phase(), Phase::Confirming { .. }));

        let commands = session.handle(
            Signal::Tick,
            1_000 + Timings::default().confirm_timeout_ms + 1,
        );

        assert!(commands.is_empty(), "{commands:?}");
        assert_eq!(session.phase(), &Phase::Armed);
    }

    #[test]
    fn answering_yes_runs_it_and_answering_no_does_not() {
        for (answer, expected) in [(true, 1), (false, 0)] {
            let mut session = session();
            session.resolved(
                crate::Resolution::Confirm {
                    invocation: crate::Invocation::bare(action::SHELL_QUIT),
                    prompt: "Quit?".into(),
                },
                0,
            );
            let commands = session.handle(Signal::Answer(answer), 500);
            assert_eq!(commands.len(), expected, "answer {answer}: {commands:?}");
        }
    }

    #[test]
    fn cancelling_closes_the_microphone_from_any_phase() {
        // A session left recording after the bar was dismissed is a microphone
        // the user believes is off.
        let mut session = session();
        session.handle(Signal::Wake, 0);
        assert_eq!(
            session.handle(Signal::Cancel, 100),
            [Command::AbandonCapture]
        );
        assert_eq!(session.phase(), &Phase::Armed);

        // And from a phase with nothing open, it is simply a no-op.
        assert!(session.handle(Signal::Cancel, 200).is_empty());
    }

    #[test]
    fn switching_voice_off_closes_the_microphone_and_drops_the_model() {
        let mut session = session();
        session.handle(Signal::Wake, 0);
        session.handle(Signal::Audio { level: LOUD }, 100);
        silence(&mut session, 100, 1_000); // → Transcribing, model marked used

        let commands = session.handle(Signal::Disable, 2_000);
        assert!(commands.contains(&Command::UnloadModel), "{commands:?}");
        assert_eq!(session.phase(), &Phase::Off);
    }

    #[test]
    fn a_wake_arriving_as_voice_is_switched_off_does_not_fire_later() {
        let mut session = session();
        session.handle(Signal::Disable, 0);
        assert!(session.handle(Signal::Wake, 100).is_empty());
        assert_eq!(session.phase(), &Phase::Off);
    }

    #[test]
    fn the_model_is_dropped_once_it_has_been_idle_long_enough() {
        // A couple of hundred megabytes resident is a lot to hold for a
        // feature used a few times an hour.
        let mut session = session();
        session.handle(Signal::Wake, 0);
        session.handle(Signal::Audio { level: LOUD }, 100);
        silence(&mut session, 100, 1_000);
        session.handle(Signal::Transcript("open slack".into()), 1_200);

        let idle = Timings::default().idle_unload_ms;
        assert!(session.handle(Signal::Tick, 1_200 + idle - 1).is_empty());
        assert_eq!(
            session.handle(Signal::Tick, 1_200 + idle + 1),
            [Command::UnloadModel]
        );
        // And not twice.
        assert!(session.handle(Signal::Tick, 1_200 + idle * 3).is_empty());
    }

    #[test]
    fn a_transcriber_that_never_answers_does_not_wedge_the_session() {
        let mut session = session();
        session.handle(Signal::Wake, 0);
        session.handle(Signal::Audio { level: LOUD }, 100);
        silence(&mut session, 100, 1_000);

        let commands = session.handle(
            Signal::Tick,
            1_100 + Timings::default().transcribe_timeout_ms + 1,
        );
        assert!(
            matches!(commands.as_slice(), [Command::Say(_)]),
            "{commands:?}"
        );
        assert_eq!(session.phase(), &Phase::Armed);
    }

    #[test]
    fn a_wake_interrupts_atlas_mid_reply() {
        // A long spoken answer would otherwise lock the user out until it
        // finished.
        let mut session = session();
        session.speaking(0);
        assert_eq!(session.handle(Signal::Wake, 500), [Command::StartCapture]);
        assert!(session.phase().is_listening());
    }

    #[test]
    fn an_unclear_phrase_is_quoted_back_rather_than_dismissed() {
        let mut session = session();
        let commands = session.resolved(
            crate::Resolution::Unclear {
                heard: "bring up crome".into(),
            },
            0,
        );
        match commands.as_slice() {
            [Command::Say(said)] => assert!(said.contains("bring up crome"), "{said}"),
            other => panic!("{other:?}"),
        }
        assert_eq!(session.phase(), &Phase::Armed);
    }

    #[test]
    fn silence_says_nothing_at_all() {
        // Replying "I heard nothing" to having heard nothing is noise, and it
        // happens most often when the user did not mean to trigger anything.
        let mut session = session();
        assert!(session.resolved(crate::Resolution::Silence, 0).is_empty());
        assert_eq!(session.phase(), &Phase::Armed);
    }

    #[test]
    fn the_microphone_is_only_open_while_listening() {
        // The property the backend keys its capture stream off, so it is worth
        // asserting directly rather than through the commands.
        let mut session = session();
        assert!(!session.phase().wants_audio());

        session.handle(Signal::Wake, 0);
        assert!(session.phase().wants_audio());

        session.handle(Signal::Audio { level: LOUD }, 100);
        silence(&mut session, 100, 1_000);
        assert!(!session.phase().wants_audio());
    }
}
