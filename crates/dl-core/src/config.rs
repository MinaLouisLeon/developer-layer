//! On-disk configuration.
//!
//! Stored as TOML under `%APPDATA%\developer-layer\`. The settings window is a
//! GUI over these files, not a replacement for them — they stay hand-editable
//! and diffable so the config can be version-controlled.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::app::PinnedApp;
use crate::monitor::MonitorId;
use crate::slot::SlotLayout;

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct Config {
    pub general: GeneralConfig,
    pub appearance: AppearanceConfig,
    pub telemetry: TelemetryConfig,
    pub atlas: AtlasConfig,
    /// Applications pinned to the dock, in dock order.
    pub pinned_apps: Vec<PinnedApp>,
    /// One layout per display set, keyed by [`crate::monitor::DisplaySet::storage_key`].
    pub layouts: Vec<SlotLayout>,
    /// Name of the layout used when a display set has no saved arrangement.
    /// When absent, an even split across available displays is generated.
    pub default_layout: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct GeneralConfig {
    /// Register a Task Scheduler entry running at logon with highest
    /// privileges. Elevation is required to manage windows owned by elevated
    /// processes; without it, tiling silently skips them.
    ///
    /// **Off by default.** This is a shell replacement: something that hides
    /// the taskbar and moves every window should not start itself elevated at
    /// logon on a machine where it has never been run once. Turn it on from
    /// the settings screen after it has behaved.
    pub start_at_logon: bool,
    /// Hide `Shell_TrayWnd` and reserve space for our dock via `SHAppBarMessage`.
    pub replace_native_taskbar: bool,
    /// Force-restores the native taskbar. Exists because a crash while the
    /// taskbar is hidden would otherwise leave no way back.
    pub panic_restore_hotkey: String,
}

impl Default for GeneralConfig {
    fn default() -> Self {
        Self {
            start_at_logon: false,
            replace_native_taskbar: false,
            panic_restore_hotkey: "Ctrl+Alt+Shift+T".into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct AppearanceConfig {
    /// Gap between tiles, in physical pixels.
    pub gap: i32,
    pub accent: String,
    /// Cap animation frame rate. Overlays are always visible, so uncapped
    /// animation burns GPU continuously across every connected display.
    pub max_fps: u8,
}

impl Default for AppearanceConfig {
    fn default() -> Self {
        Self {
            gap: 8,
            accent: "#3FBFD4".into(),
            max_fps: 30,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct TelemetryConfig {
    /// Sampling interval. Below 200 ms the CPU deltas from `sysinfo` are noise.
    pub sample_interval_ms: u32,
    /// Samples retained in the ring buffer. 300 at 1 Hz is five minutes of
    /// history, kept in Rust so it survives panel remounts and display changes.
    pub history_samples: u32,
    /// Display hosting the singleton telemetry tile. When this monitor is
    /// disconnected the tile migrates to primary rather than minimising.
    pub preferred_monitor: Option<MonitorId>,
}

impl Default for TelemetryConfig {
    fn default() -> Self {
        Self {
            sample_interval_ms: 1000,
            history_samples: 300,
            preferred_monitor: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct AtlasConfig {
    pub command_bar_hotkey: String,
    pub voice_enabled: bool,
    /// Held to speak. The only way to start an utterance today — see
    /// `dl_voice::WAKE_WORD` — and the one that needs no third-party account.
    pub push_to_talk_hotkey: String,
    /// Whisper is roughly 200 MB resident, so it loads on wake rather than at
    /// startup.
    pub lazy_load_stt: bool,
    /// The Whisper model file. Absent means voice cannot transcribe, which is
    /// reported rather than silently ignored.
    pub voice_model: Option<PathBuf>,
    /// Whether Atlas answers out loud. Off by default: a shell that talks
    /// unprompted is a shell people turn off entirely.
    pub speak_replies: bool,
    /// Picovoice access key. Free, but personal, so it is never committed.
    pub picovoice_key: Option<String>,
    /// The trained "Atlas" keyword file. Only a handful of words ship built in
    /// and ours is not among them, so this one is made on Picovoice's console.
    pub wake_word: Option<PathBuf>,
    /// Where Porcupine's library and parameters live. Defaults to a directory
    /// beside the config, which is where the settings screen installs them.
    pub picovoice_dir: Option<PathBuf>,
    /// OpenAI-compatible endpoint exposed by LM Studio.
    pub llm_endpoint: Option<String>,
}

impl Default for AtlasConfig {
    fn default() -> Self {
        Self {
            command_bar_hotkey: "Alt+Space".into(),
            voice_enabled: false,
            // Ctrl+Alt rather than a single modifier: this one is *held*, so a
            // combination people rest their hands on would open the microphone
            // by accident.
            push_to_talk_hotkey: "Ctrl+Alt+A".into(),
            lazy_load_stt: true,
            voice_model: None,
            speak_replies: false,
            picovoice_key: None,
            wake_word: None,
            picovoice_dir: None,
            llm_endpoint: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_round_trips_through_json() {
        let config = Config::default();
        let json = serde_json::to_string(&config).expect("serialise");
        let back: Config = serde_json::from_str(&json).expect("deserialise");

        assert_eq!(config, back);
    }

    #[test]
    fn partial_config_fills_in_defaults() {
        // A hand-edited file that sets one field must not lose the rest.
        let json = r#"{"appearance":{"gap":16}}"#;
        let parsed: Config = serde_json::from_str(json).expect("deserialise");

        assert_eq!(parsed.appearance.gap, 16);
        assert_eq!(
            parsed.appearance.max_fps, 30,
            "unspecified fields keep their defaults"
        );
        assert_eq!(parsed.atlas.command_bar_hotkey, "Alt+Space");
    }

    #[test]
    fn taskbar_replacement_is_off_by_default() {
        // Hiding the native taskbar is destructive if the guardian process is
        // not yet in place, so it must be opt-in.
        assert!(!Config::default().general.replace_native_taskbar);
    }
}
