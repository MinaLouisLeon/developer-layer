//! Atlas: the command registry, command bar, and voice pipeline.
//!
//! The registry is the load-bearing decision here. Every action is declared
//! once in a typed registry; fuzzy search consumes it in phase 07 and LM Studio
//! tool-calling consumes the same registry in phase 09. Defining it twice is
//! what turns adding an LLM into a rewrite of the action layer.
//!
//! Voice pipeline: Porcupine for the "Atlas" wake word (a custom keyword, since
//! only "Jarvis" ships built in), `whisper-rs` for transcription loaded lazily
//! on wake because it costs ~200MB resident, and WinRT SpeechSynthesis for
//! output.

#![doc(html_no_source)]
