//! What voice needs on disk, and what it can do without.
//!
//! Neither engine ships inside the binary. The wake word is a Picovoice
//! keyword file trained for "Atlas" — only "Jarvis" and a handful of others
//! come built in, so ours has to be made on their console — and it needs an
//! access key. Transcription is a Whisper model of a couple of hundred
//! megabytes. Both are the user's to supply.
//!
//! So the interesting question is not "is voice on" but "what works right
//! now", and the answer has to reach the UI. A microphone button that does
//! nothing, with no way to find out why, is worse than one that is absent.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// How an utterance is started.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub enum Trigger {
    /// Saying "Atlas". Needs the keyword file and an access key.
    WakeWord,
    /// Holding the configured key. Needs nothing beyond a microphone, which is
    /// why it is the fallback rather than the wake word being the only way in.
    PushToTalk,
}

/// Where the voice assets are, as configured.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct VoiceAssets {
    /// Picovoice access key. Free to obtain, but personal, so it is never
    /// bundled and never committed.
    pub access_key: Option<String>,
    /// The "Atlas" keyword file, `.ppn`. Trained on Picovoice's console —
    /// only a handful of words ship built in and ours is not among them, so
    /// this is the one piece nothing can fetch on the user's behalf.
    pub keyword: Option<PathBuf>,
    /// Directory holding Porcupine's shared library and its parameters.
    ///
    /// Together because they are fetched together; a user who has one always
    /// has the other, and reporting them apart would be two ways of saying
    /// "the runtime is not installed".
    pub runtime: Option<PathBuf>,
    /// Whether that directory actually holds both files. Answered by
    /// `dl-voice`, which knows what each platform names them.
    pub runtime_installed: bool,
    /// The Whisper model, `.bin`.
    pub model: Option<PathBuf>,
}

/// One reason something is unavailable, in words a user can act on.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct Missing {
    /// What is missing, named as the setting rather than as a variable.
    pub what: String,
    /// What to do about it.
    pub remedy: String,
}

/// What voice can do as configured.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct Capability {
    /// True when an utterance can be started at all.
    pub usable: bool,
    /// Whether the wake word is available on top of push-to-talk.
    pub wake_word: bool,
    /// Whether an utterance can be turned into text. Without it there is
    /// nothing to do with a recording, so this gates `usable`.
    pub transcription: bool,
    /// Everything absent, each with what to do about it. Empty when
    /// everything is present.
    pub missing: Vec<Missing>,
}

/// What the running build can actually do, regardless of configuration.
///
/// Separate from the assets because they fail differently and the user can act
/// on only one of them. A missing model is something to download; an engine
/// this build does not contain is not.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Engines {
    /// Whether a wake-word engine is compiled in. False today — see
    /// `dl_voice::WAKE_WORD`.
    pub wake_word: bool,
    /// Whether a transcriber is compiled in. False off Windows.
    pub transcription: bool,
}

impl Default for Engines {
    fn default() -> Self {
        Self {
            wake_word: false,
            transcription: true,
        }
    }
}

/// Judge the configured assets against what this build contains.
///
/// `exists` is injected rather than calling the filesystem, so the rules are
/// tested without laying down a two-hundred-megabyte fixture.
pub fn capability(
    assets: &VoiceAssets,
    engines: Engines,
    exists: &dyn Fn(&std::path::Path) -> bool,
) -> Capability {
    let mut missing = Vec::new();

    if !engines.transcription {
        // Nothing else is worth reporting: without a transcriber there is no
        // configuration that would make voice work, so listing what to
        // download would send the user off to fix the wrong thing.
        return Capability {
            usable: false,
            wake_word: false,
            transcription: false,
            missing: vec![Missing {
                what: "speech support in this build".into(),
                remedy: "Voice runs on Windows. This build has no transcriber.".into(),
            }],
        };
    }

    let model = match &assets.model {
        Some(path) if exists(path) => true,
        Some(path) => {
            missing.push(Missing {
                what: format!("the speech model at {}", path.display()),
                remedy: "Download a Whisper model and point `atlas.voiceModel` at it.".into(),
            });
            false
        }
        None => {
            missing.push(Missing {
                what: "a speech model".into(),
                remedy: "Set `atlas.voiceModel` to a Whisper model file.".into(),
            });
            false
        }
    };

    if !engines.wake_word {
        // Said once, plainly, instead of listing a key and a keyword the user
        // could supply and still not get a wake word.
        missing.push(Missing {
            what: "a wake word engine".into(),
            remedy: "This build listens on the push-to-talk key instead; saying \"Atlas\" is not wired up yet.".into(),
        });

        return Capability {
            usable: model,
            wake_word: false,
            transcription: model,
            missing,
        };
    }

    // The wake word needs both halves. Reported as two separate gaps, because
    // having the key and not the keyword is a different fix from the reverse.
    let key = assets
        .access_key
        .as_deref()
        .is_some_and(|k| !k.trim().is_empty());
    if !key {
        missing.push(Missing {
            what: "a Picovoice access key".into(),
            remedy: "Get a free key from console.picovoice.ai and set `atlas.picovoiceKey`.".into(),
        });
    }

    let keyword = match &assets.keyword {
        Some(path) if exists(path) => true,
        Some(path) => {
            missing.push(Missing {
                what: format!("the wake word file at {}", path.display()),
                remedy: "Train an \"Atlas\" keyword on console.picovoice.ai and point `atlas.wakeWord` at the .ppn.".into(),
            });
            false
        }
        None => {
            missing.push(Missing {
                what: "an \"Atlas\" wake word file".into(),
                remedy: "Train one on console.picovoice.ai and set `atlas.wakeWord` to the .ppn."
                    .into(),
            });
            false
        }
    };

    // Reported on its own because it is the only one of the three wake-word
    // requirements the shell can install itself. The key needs the user's own
    // account and the keyword needs a word trained on it; this is a download.
    if !assets.runtime_installed {
        missing.push(Missing {
            what: "Porcupine's runtime".into(),
            remedy: "Download it from the settings screen.".into(),
        });
    }

    Capability {
        // Push-to-talk needs no assets, so transcription is the only hard
        // requirement: a recording nothing can read is not a feature.
        usable: model,
        wake_word: key && keyword && model && assets.runtime_installed,
        transcription: model,
        missing,
    }
}

impl Capability {
    /// The triggers that actually work, best first.
    pub fn triggers(&self) -> Vec<Trigger> {
        let mut triggers = Vec::new();
        if !self.usable {
            return triggers;
        }
        if self.wake_word {
            triggers.push(Trigger::WakeWord);
        }
        // Always available once transcription is: it costs nothing to offer
        // and it is what makes voice work without a Picovoice account.
        triggers.push(Trigger::PushToTalk);
        triggers
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn present(_: &std::path::Path) -> bool {
        true
    }
    fn absent(_: &std::path::Path) -> bool {
        false
    }

    /// A build with everything, so the asset rules can be tested on their own.
    fn full_engines() -> Engines {
        Engines {
            wake_word: true,
            transcription: true,
        }
    }

    fn full() -> VoiceAssets {
        VoiceAssets {
            access_key: Some("pv-key".into()),
            keyword: Some(PathBuf::from("atlas.ppn")),
            runtime: Some(PathBuf::from("picovoice")),
            runtime_installed: true,
            model: Some(PathBuf::from("ggml-base.en.bin")),
        }
    }

    #[test]
    fn everything_present_offers_both_triggers_and_reports_nothing_missing() {
        let capability = capability(&full(), full_engines(), &present);
        assert!(capability.usable && capability.wake_word);
        assert!(capability.missing.is_empty());
        assert_eq!(
            capability.triggers(),
            [Trigger::WakeWord, Trigger::PushToTalk]
        );
    }

    #[test]
    fn voice_still_works_without_a_picovoice_account() {
        // The whole reason push-to-talk exists. The wake word needs a key and
        // a keyword trained on somebody else's console; requiring that to say
        // anything at all would put voice behind a signup.
        let assets = VoiceAssets {
            access_key: None,
            keyword: None,
            ..full()
        };
        let capability = capability(&assets, full_engines(), &present);

        assert!(capability.usable);
        assert!(!capability.wake_word);
        assert_eq!(capability.triggers(), [Trigger::PushToTalk]);
    }

    #[test]
    fn without_a_speech_model_nothing_works_at_all() {
        // A recording nothing can read is not a feature, so this gates
        // everything rather than only the wake word.
        let assets = VoiceAssets {
            model: None,
            ..full()
        };
        let capability = capability(&assets, full_engines(), &present);

        assert!(!capability.usable);
        assert!(!capability.wake_word);
        assert!(capability.triggers().is_empty());
    }

    #[test]
    fn a_configured_path_that_is_not_there_says_so_by_name() {
        // "Voice is unavailable" sends the user looking through settings. The
        // path they typed, echoed back, sends them to the typo.
        let capability = capability(&full(), full_engines(), &absent);
        let model = capability
            .missing
            .iter()
            .find(|m| m.what.contains("ggml-base.en.bin"))
            .expect("the model path is named");
        assert!(model.remedy.contains("atlas.voiceModel"));
    }

    #[test]
    fn a_key_and_a_keyword_are_reported_as_separate_gaps() {
        // Having one and not the other is a different fix from having neither,
        // and one message covering both would send half the users to the wrong
        // place.
        let assets = VoiceAssets {
            access_key: Some("pv-key".into()),
            keyword: None,
            ..full()
        };
        let capability = capability(&assets, full_engines(), &present);

        assert_eq!(capability.missing.len(), 1);
        assert!(capability.missing[0].what.contains("wake word"));
    }

    #[test]
    fn a_blank_access_key_counts_as_absent() {
        // An empty string is what a half-filled settings field leaves behind,
        // and it would otherwise pass as configured and fail at runtime.
        let assets = VoiceAssets {
            access_key: Some("   ".into()),
            ..full()
        };
        assert!(!capability(&assets, full_engines(), &present).wake_word);
    }

    #[test]
    fn a_build_without_a_wake_word_engine_says_so_once() {
        // Listing a Picovoice key and a keyword file as "missing" would send
        // the user to obtain both and still not get a wake word.
        let engines = Engines::default();
        assert!(!engines.wake_word);

        let capability = capability(&full(), engines, &present);

        assert!(capability.usable, "push-to-talk still works");
        assert!(!capability.wake_word);
        assert_eq!(capability.triggers(), [Trigger::PushToTalk]);
        assert_eq!(capability.missing.len(), 1);
        assert!(capability.missing[0].what.contains("wake word engine"));
    }

    #[test]
    fn a_build_with_no_transcriber_does_not_list_things_to_download() {
        // Off Windows there is no configuration that would make voice work, so
        // naming a model to fetch would send the user to fix the wrong thing.
        let engines = Engines {
            wake_word: false,
            transcription: false,
        };
        let capability = capability(&full(), engines, &present);

        assert!(!capability.usable);
        assert_eq!(capability.missing.len(), 1);
        assert!(capability.triggers().is_empty());
    }

    #[test]
    fn a_missing_porcupine_runtime_is_the_one_gap_the_shell_can_close_itself() {
        // The key and the keyword need the user's own account and a trained
        // word; this one is a download, so it is reported on its own rather
        // than folded into a general "the wake word needs setting up".
        let assets = VoiceAssets {
            runtime_installed: false,
            ..full()
        };
        let capability = capability(&assets, full_engines(), &present);

        assert!(capability.usable, "push-to-talk is unaffected");
        assert!(!capability.wake_word);
        let gap = capability
            .missing
            .iter()
            .find(|m| m.what.contains("Porcupine"))
            .expect("named");
        assert!(gap.remedy.contains("settings"), "{gap:?}");
    }

    #[test]
    fn every_gap_carries_something_to_do_about_it() {
        let capability = capability(&VoiceAssets::default(), full_engines(), &absent);
        assert!(!capability.missing.is_empty());
        for gap in &capability.missing {
            assert!(gap.remedy.ends_with('.'), "{gap:?}");
            assert!(gap.remedy.len() > 20, "{gap:?}");
        }
    }
}
