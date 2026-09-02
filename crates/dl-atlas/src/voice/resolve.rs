//! Turning a transcript into an invocation, or refusing to.
//!
//! This is where voice differs from typing, and the difference is the whole
//! module. At the keyboard you read a list and press Enter on a row you chose;
//! the fuzzy matcher only has to put the right row somewhere near the top. By
//! voice there is no list and no second look — whatever the matcher ranks
//! first is what runs. So a scorer that always answers *something* is exactly
//! wrong here.
//!
//! Three rules follow, and each one is a way of declining:
//!
//! - **A floor.** Below it, nothing ran and Atlas says so. A phrase that was
//!   not a command at all — half of a conversation the microphone caught —
//!   must not become one.
//! - **A margin.** When the best two are close, the ranking has not actually
//!   decided anything, and picking the first is a coin toss with the user's
//!   workspace. Ask instead.
//! - **Confirmation for what cannot be undone**, from the registry's own
//!   [`crate::action::Risk`], regardless of how confident the match was. A
//!   confident mishearing is still a mishearing.

use crate::action;
use crate::palette::Entry;
use crate::recents::Recents;
use crate::search;
use crate::Invocation;

/// Minimum score for a phrase to count as a command at all.
///
/// Calibrated against `nucleo`'s scoring, where a short exact-substring match
/// on a label lands far above this and an incidental letter-scatter across an
/// unrelated row lands below. It is deliberately blunt: the cost of asking
/// again is a second of the user's time, and the cost of guessing wrong is
/// their workspace.
pub const FLOOR: u32 = 60;

/// How far ahead the winner must be to count as a decision.
///
/// "Open Chrome" and "Open ClickUp" against a muffled "open c…" score alike,
/// and running either would be a coin toss.
pub const MARGIN: u32 = 24;

/// What a transcript resolved to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Resolution {
    /// Run it.
    Run(Invocation),
    /// Run it once the user says yes, because the registry marks it risky or
    /// the match was too close to call.
    Confirm {
        invocation: Invocation,
        /// The question to put, already phrased.
        prompt: String,
    },
    /// Nothing matched well enough.
    ///
    /// Carries the transcript so the reply can quote it: "I heard *bring up
    /// crome*" tells the user their microphone worked and their phrasing did
    /// not, which "I didn't understand" does not.
    Unclear { heard: String },
    /// Nothing was said.
    Silence,
}

/// Strip what a transcriber adds and a matcher would trip on.
///
/// Whisper punctuates and capitalises, and it emits bracketed annotations for
/// non-speech — `[BLANK_AUDIO]`, `(door closes)`. None of that is in a command
/// label, and a trailing full stop is enough to cost a match.
pub fn normalise(transcript: &str) -> String {
    let mut out = String::with_capacity(transcript.len());
    let mut depth = 0usize;

    for ch in transcript.chars() {
        match ch {
            '[' | '(' => depth += 1,
            ']' | ')' => depth = depth.saturating_sub(1),
            _ if depth > 0 => {}
            c if c.is_alphanumeric() || c.is_whitespace() => out.push(c),
            // Apostrophes hold words together; everything else is punctuation
            // a transcriber added and a label never has.
            '\'' | '\u{2019}' => out.push('\''),
            _ => out.push(' '),
        }
    }

    out.split_whitespace()
        .filter(|word| !is_filler(word))
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// Words that carry no signal but do carry score.
///
/// The wake word most of all: Porcupine strips it from the audio it hands
/// over, but push-to-talk does not, and a leading "atlas" would otherwise
/// fuzzy-match the word in half the labels.
fn is_filler(word: &str) -> bool {
    const FILLER: &[&str] = &[
        "atlas", "please", "could", "would", "you", "um", "uh", "er", "hey", "ok", "okay",
    ];
    FILLER.contains(&word.to_lowercase().as_str())
}

/// Resolve a transcript against the palette.
pub fn resolve(transcript: &str, entries: &[Entry], recents: &Recents) -> Resolution {
    let heard = transcript.trim().to_string();
    let query = normalise(&heard);

    if query.is_empty() {
        return Resolution::Silence;
    }

    let hits = search::rank(entries, &query, recents);

    let Some(best) = hits.first() else {
        return Resolution::Unclear { heard };
    };

    if best.score < FLOOR {
        return Resolution::Unclear { heard };
    }

    let runner_up = hits.get(1).map(|h| h.score).unwrap_or(0);
    let decisive = best.score.saturating_sub(runner_up) >= MARGIN || hits.len() == 1;

    let invocation = best.entry.invocation.clone();

    if !decisive {
        // Two plausible readings. Naming the winner in the question means the
        // user answers "yes" rather than starting again.
        return Resolution::Confirm {
            prompt: format!("Did you mean: {}?", best.entry.label),
            invocation,
        };
    }

    if action::find(invocation.action).is_some_and(|a| a.needs_confirmation()) {
        return Resolution::Confirm {
            prompt: format!("{}?", best.entry.label),
            invocation,
        };
    }

    Resolution::Run(invocation)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::palette::{self, Context};
    use dl_core::{AppId, AppRef, DockEntry, DockWindow, PinnedApp, WindowId};

    fn app(id: &str, name: &str) -> PinnedApp {
        PinnedApp {
            id: AppId::new(id),
            display_name: name.into(),
            app_ref: AppRef::executable(format!(r"C:\{id}.exe")),
            icon_key: None,
            always_float: false,
        }
    }

    fn installed() -> Vec<PinnedApp> {
        vec![
            app("chrome", "Chrome"),
            app("clickup", "ClickUp"),
            app("slack", "Slack"),
            app("code", "VS Code"),
        ]
    }

    fn palette_of(installed: &[PinnedApp], dock: &[DockEntry]) -> Vec<Entry> {
        palette::build(&Context {
            installed,
            dock,
            taskbar_hidden: false,
        })
    }

    fn heard(phrase: &str) -> Resolution {
        let apps = installed();
        let entries = palette_of(&apps, &[]);
        resolve(phrase, &entries, &Recents::default())
    }

    #[test]
    fn a_clear_command_runs() {
        let resolution = heard("open slack");
        assert_eq!(
            resolution,
            Resolution::Run(Invocation::with(
                action::APP_OPEN,
                crate::Arg::App(AppId::new("slack"))
            ))
        );
    }

    #[test]
    fn punctuation_and_capitals_from_the_transcriber_do_not_cost_a_match() {
        // Whisper writes "Open Slack." and the full stop alone is enough to
        // move a borderline match under the floor.
        assert_eq!(heard("Open Slack."), heard("open slack"));
    }

    #[test]
    fn the_wake_word_is_stripped_before_matching() {
        // Porcupine removes it from the audio; push-to-talk does not. A
        // leading "atlas" would fuzzy-match the letters in half the labels.
        assert_eq!(heard("Atlas, open slack"), heard("open slack"));
        assert_eq!(normalise("Atlas please open Slack"), "open slack");
    }

    #[test]
    fn a_transcribers_bracketed_annotations_are_not_a_command() {
        // `[BLANK_AUDIO]` and `(door closes)` are what Whisper emits for
        // non-speech, and they are not what the user said.
        assert_eq!(normalise("[BLANK_AUDIO]"), "");
        assert_eq!(normalise("(door closes) open slack"), "open slack");
        assert!(matches!(heard("[BLANK_AUDIO]"), Resolution::Silence));
    }

    #[test]
    fn overheard_conversation_does_not_become_a_command() {
        // The microphone is open; half a sentence from the room reaching it is
        // routine, and a matcher that always answers something would act on it.
        for phrase in [
            "so I said to him that was never going to work",
            "yeah I'll be there in about twenty minutes",
        ] {
            assert!(
                matches!(heard(phrase), Resolution::Unclear { .. }),
                "{phrase} was taken as a command: {:?}",
                heard(phrase)
            );
        }
    }

    #[test]
    fn silence_is_distinguished_from_a_phrase_that_did_not_match() {
        // They deserve different replies: one is "I heard nothing", the other
        // is "I heard you and it was not a command".
        assert!(matches!(heard("   "), Resolution::Silence));
        assert!(matches!(
            heard("bananas quantum"),
            Resolution::Unclear { .. }
        ));
    }

    #[test]
    fn what_was_heard_comes_back_so_the_reply_can_quote_it() {
        // "I heard 'open crome'" tells the user the microphone worked and the
        // phrasing did not. "I didn't understand" tells them nothing.
        match heard("kumquat orrery") {
            Resolution::Unclear { heard } => assert_eq!(heard, "kumquat orrery"),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn two_close_readings_ask_rather_than_pick_one() {
        // "Open Chrome" and "Open ClickUp" against a muffled "open c" score
        // alike, and running either is a coin toss with the user's workspace.
        match heard("open c") {
            Resolution::Confirm { prompt, .. } => {
                assert!(prompt.starts_with("Did you mean"), "{prompt}");
            }
            other => panic!("expected a question, got {other:?}"),
        }
    }

    #[test]
    fn quitting_asks_even_when_the_match_was_certain() {
        // A confident mishearing is still a mishearing, and this is the one
        // action that cannot be undone by doing it again.
        match heard("quit developer layer") {
            Resolution::Confirm { invocation, prompt } => {
                assert_eq!(invocation.action, action::SHELL_QUIT);
                assert!(prompt.contains("Quit"), "{prompt}");
            }
            other => panic!("expected a question, got {other:?}"),
        }
    }

    #[test]
    fn a_window_can_be_reached_by_what_is_written_in_its_title_bar() {
        let dock = vec![DockEntry {
            app: Some(AppId::new("chrome")),
            display_name: "Chrome".into(),
            pinned: true,
            windows: vec![DockWindow {
                id: WindowId(3),
                title: "Quarterly review".into(),
                minimized: false,
            }],
            active: false,
        }];
        let entries = palette_of(&[], &dock);

        match resolve("focus quarterly review", &entries, &Recents::default()) {
            Resolution::Run(invocation) => {
                assert_eq!(invocation.action, action::WINDOW_FOCUS)
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn an_empty_palette_refuses_rather_than_panicking() {
        // Reachable at first launch, before anything has been discovered.
        assert!(matches!(
            resolve("open slack", &[], &Recents::default()),
            Resolution::Unclear { .. }
        ));
    }
}
