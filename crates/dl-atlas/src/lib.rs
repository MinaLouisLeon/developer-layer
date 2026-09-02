//! Atlas: the command registry, the command bar, and later the voice pipeline.
//!
//! The registry is the load-bearing decision. Every action is declared once in
//! [`action::ACTIONS`]; fuzzy search consumes it in phase 07 and LM Studio
//! tool-calling consumes the same declarations in phase 09. Defining actions
//! twice is what turns adding an LLM into a rewrite of the action layer.
//!
//! The pipeline runs registry → [`palette`] → [`search`] → [`plan`], and every
//! stage is pure over a snapshot of the workspace. Nothing here calls the
//! operating system, so the rules that decide what the bar shows and what a
//! row does are tested rather than discovered by opening it.
//!
//! Voice, later: Porcupine for the "Atlas" wake word (a custom keyword — only
//! "Jarvis" ships built in), `whisper-rs` for transcription loaded lazily on
//! wake because it costs ~200 MB resident, and WinRT SpeechSynthesis out.

pub mod action;
pub mod hotkey;
pub mod invocation;
pub mod palette;
pub mod plan;
pub mod recents;
pub mod search;
pub mod view;
pub mod voice;

pub use action::{Action, ActionId, Category, Param, ParamKind, ACTIONS};
pub use hotkey::{Hotkey, Hotkeys};
pub use invocation::{Arg, Invocation};
pub use palette::{Context, Entry};
pub use plan::{Effect, Surface};
pub use recents::Recents;
pub use search::Hit;
pub use view::AtlasHit;
pub use voice::{Capability, Resolution, Trigger, VoiceAssets};

use dl_core::WindowId;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AtlasError {
    #[error("there is no action called {0}")]
    UnknownAction(String),
    #[error("{action} needs a {param}")]
    MissingArgument {
        action: ActionId,
        param: &'static str,
    },
    #[error("{action} takes no argument")]
    UnexpectedArgument { action: ActionId },
    #[error("expected {expected}, got {got}")]
    BadArgument { expected: &'static str, got: String },
    #[error("that window has closed")]
    WindowGone(WindowId),
    #[error("{what}")]
    NothingToDo { what: &'static str },

    #[error("no hotkey is set")]
    EmptyHotkey,
    #[error("{hotkey} has no key, only modifiers")]
    HotkeyHasNoKey { hotkey: String },
    #[error("{hotkey} names two keys; a hotkey has one")]
    HotkeyHasTwoKeys { hotkey: String },
    #[error(
        "{hotkey} has no modifier, so it would capture that key for the whole desktop — add Ctrl, Alt, Shift or Win"
    )]
    HotkeyHasNoModifier { hotkey: String },
    #[error("{hotkey} is set for two different things; only one of them would work")]
    HotkeyCollision { hotkey: String },
}

pub type Result<T> = std::result::Result<T, AtlasError>;
