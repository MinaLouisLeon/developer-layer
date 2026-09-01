//! Configuration persistence.
//!
//! Config lives as TOML under `%APPDATA%\developer-layer\`. The settings window
//! is a GUI over these files, not a replacement for them — they stay
//! hand-editable and diffable, so the whole workspace can be version
//! controlled.
//!
//! Two rules govern this module, both about not losing the user's work:
//!
//! - **Writes are atomic.** A crash or power loss mid-save must never leave a
//!   truncated config, because that config holds every slot layout.
//! - **A corrupt file is an error, never a reset.** Silently falling back to
//!   defaults would quietly discard layouts the user spent time arranging.
//!   Refusing to start with a clear message is the kinder failure.

use std::io::Write;
use std::path::{Path, PathBuf};

use dl_core::Config;

pub const CONFIG_FILE: &str = "config.toml";
const APP_DIR: &str = "developer-layer";

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("could not determine a config directory for this platform")]
    NoConfigDir,
    #[error("reading {path}: {source}")]
    Read {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("writing {path}: {source}")]
    Write {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("{path} is not valid config: {source}")]
    Parse {
        path: PathBuf,
        #[source]
        source: toml::de::Error,
    },
    #[error("serialising config: {0}")]
    Serialize(#[from] toml::ser::Error),
}

pub type Result<T> = std::result::Result<T, ConfigError>;

/// Directory holding the config, creating nothing.
///
/// `%APPDATA%\developer-layer` on Windows; `$XDG_CONFIG_HOME` or `~/.config`
/// elsewhere, which is what makes this testable off-Windows.
pub fn config_dir() -> Result<PathBuf> {
    let base = if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from)
    } else {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
    };

    base.map(|b| b.join(APP_DIR))
        .ok_or(ConfigError::NoConfigDir)
}

pub fn config_path() -> Result<PathBuf> {
    Ok(config_dir()?.join(CONFIG_FILE))
}

/// Load config from `path`.
///
/// A missing file yields defaults — that is a first run, not a failure. A
/// malformed file is an error, because overwriting it with defaults would
/// destroy the layouts it was supposed to hold.
pub fn load_from(path: &Path) -> Result<Config> {
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Config::default()),
        Err(source) => {
            return Err(ConfigError::Read {
                path: path.to_path_buf(),
                source,
            })
        }
    };

    toml::from_str(&text).map_err(|source| ConfigError::Parse {
        path: path.to_path_buf(),
        source,
    })
}

/// Save config to `path`, creating parent directories as needed.
///
/// Writes to a temporary file in the same directory and renames over the
/// target. Rename is atomic on both NTFS and ext4, so a reader either sees the
/// old config or the new one, never a half-written file.
pub fn save_to(path: &Path, config: &Config) -> Result<()> {
    let text = toml::to_string_pretty(config)?;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|source| ConfigError::Write {
            path: parent.to_path_buf(),
            source,
        })?;
    }

    // Same directory as the target: rename is only atomic within a filesystem.
    let tmp = path.with_extension("toml.tmp");

    let write = || -> std::io::Result<()> {
        let mut file = std::fs::File::create(&tmp)?;
        file.write_all(text.as_bytes())?;
        // Without this the rename can land before the contents reach disk,
        // which on power loss leaves an empty file where the config was.
        file.sync_all()?;
        Ok(())
    };

    write().map_err(|source| ConfigError::Write {
        path: tmp.clone(),
        source,
    })?;

    std::fs::rename(&tmp, path).map_err(|source| {
        let _ = std::fs::remove_file(&tmp);
        ConfigError::Write {
            path: path.to_path_buf(),
            source,
        }
    })
}

/// Load from the platform's config location.
pub fn load() -> Result<Config> {
    load_from(&config_path()?)
}

/// Save to the platform's config location.
pub fn save(config: &Config) -> Result<()> {
    save_to(&config_path()?, config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use dl_core::{
        AppId, AppRef, DisplaySet, MonitorId, NormalizedRect, PinnedApp, Slot, SlotId, SlotLayout,
    };

    fn sample() -> Config {
        Config {
            pinned_apps: vec![PinnedApp {
                id: AppId::new("whatsapp"),
                display_name: "WhatsApp".into(),
                app_ref: AppRef::packaged("5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App"),
                icon_key: None,
                always_float: false,
            }],
            layouts: vec![SlotLayout::new(
                DisplaySet::new(vec![MonitorId::new("dell")]),
                "Docked",
                vec![Slot {
                    id: SlotId::new("main"),
                    monitor: MonitorId::new("dell"),
                    bounds: NormalizedRect::new(0.0, 0.0, 0.6, 1.0),
                    assigned_app: Some(AppId::new("vscode")),
                    is_telemetry: false,
                }],
            )],
            default_layout: Some("Docked".into()),
            ..Default::default()
        }
    }

    #[test]
    fn a_saved_config_round_trips_with_its_layouts_intact() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join(CONFIG_FILE);

        save_to(&path, &sample()).expect("save");

        assert_eq!(load_from(&path).expect("load"), sample());
    }

    #[test]
    fn a_missing_file_is_a_first_run_not_an_error() {
        let dir = tempfile::tempdir().expect("tempdir");

        let loaded = load_from(&dir.path().join("nothing-here.toml")).expect("load");

        assert_eq!(loaded, Config::default());
    }

    #[test]
    fn a_corrupt_file_errors_rather_than_silently_resetting() {
        // Resetting would destroy every layout the user had arranged.
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join(CONFIG_FILE);
        std::fs::write(&path, "this is not [ valid toml").expect("write");

        assert!(matches!(load_from(&path), Err(ConfigError::Parse { .. })));
    }

    #[test]
    fn saving_creates_missing_parent_directories() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("nested").join("deeper").join(CONFIG_FILE);

        save_to(&path, &Config::default()).expect("save");

        assert!(path.exists());
    }

    #[test]
    fn saving_leaves_no_temporary_file_behind() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join(CONFIG_FILE);

        save_to(&path, &sample()).expect("save");

        let leftovers: Vec<_> = std::fs::read_dir(dir.path())
            .expect("read dir")
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.ends_with(".tmp"))
            .collect();

        assert!(leftovers.is_empty(), "left behind {leftovers:?}");
    }

    #[test]
    fn overwriting_an_existing_config_replaces_it_wholesale() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join(CONFIG_FILE);

        save_to(&path, &sample()).expect("first save");
        save_to(&path, &Config::default()).expect("second save");

        let loaded = load_from(&path).expect("load");
        assert!(
            loaded.layouts.is_empty(),
            "stale content survived the overwrite"
        );
    }

    #[test]
    fn a_hand_edited_partial_file_keeps_its_defaults() {
        // The config is meant to be edited by hand; setting one field must not
        // blank out everything else.
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join(CONFIG_FILE);
        std::fs::write(&path, "[appearance]\ngap = 16\n").expect("write");

        let loaded = load_from(&path).expect("load");

        assert_eq!(loaded.appearance.gap, 16);
        assert_eq!(loaded.atlas.command_bar_hotkey, "Alt+Space");
    }
}
