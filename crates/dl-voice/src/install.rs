//! Fetching the two things voice needs and cannot ship.
//!
//! A Whisper model is a couple of hundred megabytes and Porcupine's runtime is
//! somebody else's binary under somebody else's licence. Neither belongs in
//! this repository, so both are downloaded into the user's config directory on
//! request — the alternative is a README instruction and a manual file copy
//! for a feature that is otherwise one keystroke.
//!
//! The catalogue is pure and tested. The transfer is not, but everything about
//! it that can be decided in advance — where a file lands, whether a partial
//! one may be trusted, what a wrong size means — is.

use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use crate::{Result, VoiceError};

/// One downloadable asset.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Asset {
    /// Stable identifier the UI passes back.
    pub id: &'static str,
    pub label: &'static str,
    /// What it is for, in a sentence.
    pub summary: &'static str,
    pub url: &'static str,
    /// File name it is saved as, relative to its directory. For anything the
    /// rest of the crate loads by name, this must match what loads it.
    pub file: &'static str,
    /// Expected size. Checked after the transfer: a truncated model fails deep
    /// inside whisper.cpp with a message about a bad magic number, which sends
    /// the reader looking in entirely the wrong place.
    pub bytes: u64,
}

/// Whisper models, smallest first.
///
/// Only the English-only builds: every command in the registry is English, and
/// the multilingual models are larger and slightly worse at English for it.
pub const MODELS: &[Asset] = &[
    Asset {
        id: "whisper-tiny-en",
        label: "Whisper tiny (English)",
        summary: "Fastest and smallest. Good enough for short commands on a busy machine.",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
        file: "ggml-tiny.en.bin",
        bytes: 77_691_713,
    },
    Asset {
        id: "whisper-base-en",
        label: "Whisper base (English)",
        summary: "The sensible default: noticeably more accurate than tiny, still quick.",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
        file: "ggml-base.en.bin",
        bytes: 147_951_465,
    },
    Asset {
        id: "whisper-small-en",
        label: "Whisper small (English)",
        summary: "Most accurate of the three, and the slowest — around a second per phrase.",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
        file: "ggml-small.en.bin",
        bytes: 487_601_967,
    },
];

/// Porcupine's runtime, from Picovoice's own repository.
///
/// Their library and their model, fetched rather than committed: they are
/// Apache-2.0 code but Picovoice-licensed binaries, and vendoring somebody
/// else's binary is a licence decision this project does not need to make.
/// The library's own name and path differ per platform, and they have to agree
/// with [`crate::wake::Runtime::library`] exactly — a mismatch would report the
/// wake word as uninstalled forever after a download that plainly worked.
/// There is a test for precisely that.
#[cfg(windows)]
const PORCUPINE_LIBRARY_URL: &str =
    "https://raw.githubusercontent.com/Picovoice/porcupine/v3.0/lib/windows/amd64/libpv_porcupine.dll";
#[cfg(windows)]
const PORCUPINE_LIBRARY_FILE: &str = "libpv_porcupine.dll";

#[cfg(target_os = "macos")]
const PORCUPINE_LIBRARY_URL: &str =
    "https://raw.githubusercontent.com/Picovoice/porcupine/v3.0/lib/mac/arm64/libpv_porcupine.dylib";
#[cfg(target_os = "macos")]
const PORCUPINE_LIBRARY_FILE: &str = "libpv_porcupine.dylib";

#[cfg(all(not(windows), not(target_os = "macos")))]
const PORCUPINE_LIBRARY_URL: &str =
    "https://raw.githubusercontent.com/Picovoice/porcupine/v3.0/lib/linux/x86_64/libpv_porcupine.so";
#[cfg(all(not(windows), not(target_os = "macos")))]
const PORCUPINE_LIBRARY_FILE: &str = "libpv_porcupine.so";

pub const PORCUPINE: &[Asset] = &[
    Asset {
        id: "porcupine-library",
        label: "Porcupine library",
        summary: "The wake word engine itself.",
        url: PORCUPINE_LIBRARY_URL,
        file: PORCUPINE_LIBRARY_FILE,
        bytes: 0,
    },
    Asset {
        id: "porcupine-params",
        label: "Porcupine parameters",
        summary: "The model every keyword is decoded against.",
        url: "https://raw.githubusercontent.com/Picovoice/porcupine/v3.0/lib/common/porcupine_params.pv",
        file: "porcupine_params.pv",
        bytes: 0,
    },
];

/// Everything installable, for the settings screen.
pub fn catalogue() -> impl Iterator<Item = &'static Asset> {
    MODELS.iter().chain(PORCUPINE.iter())
}

pub fn find(id: &str) -> Option<&'static Asset> {
    catalogue().find(|asset| asset.id == id)
}

/// Where an asset is installed, given the config directory.
///
/// Models sit beside the config; Porcupine's two files go in a subdirectory of
/// their own, because `Runtime` looks for them together and a directory is what
/// it is given.
pub fn destination(asset: &Asset, config_dir: &Path) -> PathBuf {
    if asset.id.starts_with("porcupine-") {
        config_dir.join("picovoice").join(asset.file)
    } else {
        config_dir.join("models").join(asset.file)
    }
}

/// How a download is progressing, for the UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Progress {
    pub downloaded: u64,
    /// `None` when the server did not say. Rare, but a progress bar that
    /// invents a total is worse than one that admits it does not know.
    pub total: Option<u64>,
}

impl Progress {
    pub fn percent(&self) -> Option<u8> {
        let total = self.total.filter(|t| *t > 0)?;
        Some(((self.downloaded.min(total) * 100) / total) as u8)
    }
}

/// Fetch `asset` into `config_dir`, reporting progress.
///
/// Downloads to a temporary name and renames on success, so an interrupted
/// transfer never leaves a half-file where a working one is expected. That
/// matters more than usual here: a truncated model loads and then fails inside
/// whisper.cpp with a message about a magic number.
pub fn install(
    asset: &Asset,
    config_dir: &Path,
    mut on_progress: impl FnMut(Progress),
) -> Result<PathBuf> {
    let target = destination(asset, config_dir);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            VoiceError::Install(format!("could not create {}: {e}", parent.display()))
        })?;
    }

    let response = ureq::get(asset.url)
        .call()
        .map_err(|e| VoiceError::Install(format!("{} could not be fetched: {e}", asset.label)))?;

    let total = response
        .header("Content-Length")
        .and_then(|value| value.parse::<u64>().ok())
        // Fall back to what the catalogue expects, which is better than no bar
        // at all for a file this size.
        .or(Some(asset.bytes).filter(|b| *b > 0));

    let partial = target.with_extension("partial");
    let mut file = std::fs::File::create(&partial)
        .map_err(|e| VoiceError::Install(format!("could not write {}: {e}", partial.display())))?;

    let mut reader = response.into_reader();
    let mut buffer = vec![0u8; 64 * 1024];
    let mut downloaded = 0u64;

    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|e| VoiceError::Install(format!("the transfer failed: {e}")))?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read]).map_err(|e| {
            VoiceError::Install(format!("could not write {}: {e}", partial.display()))
        })?;
        downloaded += read as u64;
        on_progress(Progress { downloaded, total });
    }

    file.sync_all()
        .map_err(|e| VoiceError::Install(format!("could not flush {}: {e}", partial.display())))?;
    drop(file);

    if let Err(e) = verify(asset, downloaded) {
        // The partial file is removed rather than left to be found later and
        // mistaken for a finished one.
        let _ = std::fs::remove_file(&partial);
        return Err(e);
    }

    std::fs::rename(&partial, &target)
        .map_err(|e| VoiceError::Install(format!("could not finish {}: {e}", target.display())))?;

    tracing::info!(asset = asset.id, path = ?target, bytes = downloaded, "installed");
    Ok(target)
}

/// Reject a transfer that plainly did not finish.
///
/// A tolerance rather than an exact match: the published sizes drift when a
/// model is re-uploaded, and failing a good download over a few hundred bytes
/// would be worse than the problem being guarded against. What this catches is
/// the interesting case — a connection cut halfway, or an HTML error page
/// saved under a `.bin` name.
pub fn verify(asset: &Asset, downloaded: u64) -> Result<()> {
    if downloaded == 0 {
        return Err(VoiceError::Install(format!(
            "{} downloaded as an empty file",
            asset.label
        )));
    }

    if asset.bytes == 0 {
        // Nothing to check against; the catalogue does not pin a size for
        // Picovoice's files because they change with every release.
        return Ok(());
    }

    let tolerance = asset.bytes / 100;
    let low = asset.bytes.saturating_sub(tolerance);
    if downloaded < low {
        return Err(VoiceError::Install(format!(
            "{} stopped after {downloaded} bytes of about {}; the download did not finish",
            asset.label, asset.bytes
        )));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_asset_has_a_unique_id_the_ui_can_pass_back() {
        let mut seen = std::collections::HashSet::new();
        for asset in catalogue() {
            assert!(seen.insert(asset.id), "duplicate id {}", asset.id);
            assert!(find(asset.id).is_some());
        }
        assert!(find("whisper-enormous").is_none());
    }

    #[test]
    fn porcupine_lands_where_the_runtime_looks_for_it() {
        // `Runtime` is handed a directory and expects both files in it. If
        // these two disagree, the wake word reports "not installed" forever
        // after a download that plainly succeeded.
        let config = Path::new("/config");
        let runtime = crate::wake::Runtime {
            directory: config.join("picovoice"),
        };

        let library = find("porcupine-library").expect("library");
        let params = find("porcupine-params").expect("params");

        assert_eq!(destination(library, config), runtime.library());
        assert_eq!(destination(params, config), runtime.parameters());
    }

    #[test]
    fn models_do_not_land_in_the_porcupine_directory() {
        let config = Path::new("/config");
        let model = find("whisper-base-en").expect("model");
        assert_eq!(
            destination(model, config),
            config.join("models").join("ggml-base.en.bin")
        );
    }

    #[test]
    fn a_transfer_cut_in_half_is_refused() {
        // The case that matters. A truncated model loads and then fails inside
        // whisper.cpp with a message about a magic number, which sends the
        // reader looking at the wrong layer entirely.
        let model = find("whisper-base-en").expect("model");
        let err = verify(model, model.bytes / 2).expect_err("truncated");
        assert!(err.to_string().contains("did not finish"), "{err}");
    }

    #[test]
    fn an_empty_file_is_refused_even_when_no_size_is_pinned() {
        // What a redirect to an error page leaves behind.
        let library = find("porcupine-library").expect("library");
        assert_eq!(library.bytes, 0, "no size is pinned for this one");
        assert!(verify(library, 0).is_err());
        assert!(verify(library, 1_000).is_ok());
    }

    #[test]
    fn a_small_drift_in_the_published_size_does_not_fail_a_good_download() {
        // Sizes change when a model is re-uploaded. Failing over a few hundred
        // bytes would be worse than the problem being guarded against.
        let model = find("whisper-base-en").expect("model");
        assert!(verify(model, model.bytes - 500).is_ok());
        assert!(verify(model, model.bytes + 5_000).is_ok());
    }

    #[test]
    fn progress_admits_when_it_does_not_know_the_total() {
        // A bar that invents a total jumps backwards when the real size
        // arrives, which reads as a fault.
        assert_eq!(
            Progress {
                downloaded: 50,
                total: None
            }
            .percent(),
            None
        );
        assert_eq!(
            Progress {
                downloaded: 50,
                total: Some(200)
            }
            .percent(),
            Some(25)
        );
    }

    #[test]
    fn progress_cannot_exceed_a_hundred_percent() {
        // Reachable when a server's Content-Length understates the body.
        assert_eq!(
            Progress {
                downloaded: 300,
                total: Some(200)
            }
            .percent(),
            Some(100)
        );
    }

    #[test]
    fn every_url_is_https() {
        // These fetch executable code onto the user's machine.
        for asset in catalogue() {
            assert!(asset.url.starts_with("https://"), "{}", asset.id);
        }
    }
}
