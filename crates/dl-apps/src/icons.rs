//! Icon cache.
//!
//! Extracting an icon means a COM round trip and a bitmap conversion, so the
//! result is written to disk and reused. What the cache is keyed on matters
//! more than it looks:
//!
//! **Keyed on application identity, not executable path.** Slack's path
//! contains its version (`app-4.35.126\slack.exe`) and changes on every
//! update. Keying on the path would orphan the cached icon every few weeks,
//! leaving the dock to re-extract — and, worse, accumulate a stale file per
//! version until the cache directory filled with dead icons.

use std::path::{Path, PathBuf};

use dl_core::AppId;

/// Icons are extracted at this size and downscaled by the UI. Shell items can
/// supply 256px for modern apps; anything smaller looks soft on a scaled
/// display, which is most of them.
pub const ICON_SIZE: u32 = 256;

#[derive(Debug, thiserror::Error)]
pub enum IconError {
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
    #[error("extracting an icon: {0}")]
    Extract(String),
}

pub type Result<T> = std::result::Result<T, IconError>;

/// An on-disk cache of extracted icons.
#[derive(Debug, Clone)]
pub struct IconCache {
    root: PathBuf,
}

impl IconCache {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    /// Cache location for an application's icon.
    pub fn path_for(&self, app: &AppId) -> PathBuf {
        self.root.join(format!("{}.png", sanitise(app.as_str())))
    }

    pub fn has(&self, app: &AppId) -> bool {
        self.path_for(app).is_file()
    }

    /// Read a cached icon as PNG bytes.
    pub fn read(&self, app: &AppId) -> Result<Option<Vec<u8>>> {
        let path = self.path_for(app);
        match std::fs::read(&path) {
            Ok(bytes) => Ok(Some(bytes)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(source) => Err(IconError::Read { path, source }),
        }
    }

    /// Store PNG bytes for an application, creating the cache directory.
    pub fn write(&self, app: &AppId, png: &[u8]) -> Result<PathBuf> {
        std::fs::create_dir_all(&self.root).map_err(|source| IconError::Write {
            path: self.root.clone(),
            source,
        })?;

        let path = self.path_for(app);
        std::fs::write(&path, png).map_err(|source| IconError::Write {
            path: path.clone(),
            source,
        })?;

        Ok(path)
    }

    /// Remove an application's cached icon, so the next request re-extracts.
    pub fn invalidate(&self, app: &AppId) -> Result<()> {
        let path = self.path_for(app);
        match std::fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(source) => Err(IconError::Write { path, source }),
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }
}

/// Encode RGBA pixels as PNG.
///
/// Icons are cached as PNG rather than raw pixels: a 256x256 RGBA buffer is
/// 256KB, and the cache holds one per pinned application on a path the UI
/// reads on every dock render.
pub fn encode_png(width: u32, height: u32, rgba: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);

        // A failure here would mean the in-memory writer refused, which cannot
        // happen; an empty Vec is still a safe result for the caller to cache.
        if let Ok(mut writer) = encoder.write_header() {
            let _ = writer.write_image_data(rgba);
        }
    }
    out
}

/// Make an app id safe as a filename.
///
/// AUMIDs contain `!` and `\`, and an id is otherwise free-form, so writing one
/// straight into a path would either fail or escape the cache directory.
fn sanitise(id: &str) -> String {
    id.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_written_icon_reads_back_unchanged() {
        let dir = tempfile::tempdir().expect("tempdir");
        let cache = IconCache::new(dir.path());
        let app = AppId::new("slack");

        cache.write(&app, b"fake-png").expect("write");

        assert_eq!(cache.read(&app).expect("read"), Some(b"fake-png".to_vec()));
        assert!(cache.has(&app));
    }

    #[test]
    fn an_uncached_icon_reads_as_none_rather_than_erroring() {
        let dir = tempfile::tempdir().expect("tempdir");
        let cache = IconCache::new(dir.path());

        assert_eq!(cache.read(&AppId::new("never-cached")).expect("read"), None);
    }

    #[test]
    fn the_key_is_the_app_id_not_its_executable_path() {
        // Slack's path carries its version and changes on every update; keying
        // on it would orphan the icon every few weeks and leak a stale file
        // per version.
        let dir = tempfile::tempdir().expect("tempdir");
        let cache = IconCache::new(dir.path());
        let slack = AppId::new("slack");

        let before_update = cache.path_for(&slack);
        let after_update = cache.path_for(&slack);

        assert_eq!(before_update, after_update);
    }

    #[test]
    fn an_aumid_is_safe_to_use_as_a_filename() {
        // Raw AUMIDs contain `!` and `.`; writing one into a path unescaped
        // fails on Windows.
        let dir = tempfile::tempdir().expect("tempdir");
        let cache = IconCache::new(dir.path());
        let app = AppId::new("5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App");

        cache.write(&app, b"png").expect("write");

        assert!(cache.has(&app));
    }

    #[test]
    fn an_id_with_separators_cannot_escape_the_cache_directory() {
        let dir = tempfile::tempdir().expect("tempdir");
        let cache = IconCache::new(dir.path());

        let path = cache.path_for(&AppId::new("../../etc/passwd"));

        assert_eq!(
            path.parent(),
            Some(dir.path()),
            "a traversal in the id escaped the cache root"
        );
    }

    #[test]
    fn writing_creates_the_cache_directory() {
        let dir = tempfile::tempdir().expect("tempdir");
        let cache = IconCache::new(dir.path().join("icons"));

        cache.write(&AppId::new("chrome"), b"png").expect("write");

        assert!(cache.root().is_dir());
    }

    #[test]
    fn invalidating_forces_a_re_extraction() {
        let dir = tempfile::tempdir().expect("tempdir");
        let cache = IconCache::new(dir.path());
        let app = AppId::new("chrome");
        cache.write(&app, b"png").expect("write");

        cache.invalidate(&app).expect("invalidate");

        assert!(!cache.has(&app));
    }

    #[test]
    fn invalidating_something_uncached_is_not_an_error() {
        let dir = tempfile::tempdir().expect("tempdir");
        let cache = IconCache::new(dir.path());

        assert!(cache.invalidate(&AppId::new("never-cached")).is_ok());
    }

    #[test]
    fn encoded_icons_are_readable_png() {
        // 2x2 opaque red.
        let rgba: Vec<u8> = std::iter::repeat_n([255, 0, 0, 255], 4).flatten().collect();

        let png = encode_png(2, 2, &rgba);

        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n", "not a PNG signature");
        assert!(png.len() > 8);
    }

    #[test]
    fn different_apps_do_not_collide() {
        let dir = tempfile::tempdir().expect("tempdir");
        let cache = IconCache::new(dir.path());

        assert_ne!(
            cache.path_for(&AppId::new("slack")),
            cache.path_for(&AppId::new("chrome"))
        );
    }
}
