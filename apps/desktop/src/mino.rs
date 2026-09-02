//! The vendored workbench's half of the Tauri layer.
//!
//! mino-workbench is embedded by *sharing the Rust core directly*: one
//! process, one `mino-core`, and a second window rather than a second
//! application. So this module is upstream's own dispatch layer, vendored
//! under `vendor/mino/desktop/` and pulled in from there — see
//! `vendor/mino/VENDOR.md`. Nothing here is written by Developer Layer beyond
//! the two `#[path]` lines below and the one-line import fix they force.
//!
//! The command *names* are upstream's, unprefixed. That is deliberate: the
//! vendored UI writes them down in `Types/modules/api.ts`, so leaving them
//! alone is what lets 274 source files come across untouched. None of the
//! forty collides with one of Developer Layer's own — a collision would be a
//! `generate_handler!` compile error rather than a silent misroute, so the
//! next resync cannot introduce one quietly.

#[path = "../../../vendor/mino/desktop/commands/mod.rs"]
pub mod commands;

#[path = "../../../vendor/mino/desktop/state.rs"]
pub mod state;
