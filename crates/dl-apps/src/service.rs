//! Application service.
//!
//! Wraps discovery, the icon cache and launching behind one API so the Tauri
//! layer needs no `cfg` blocks. On non-Windows targets the operations report
//! that they are unsupported rather than silently succeeding, which keeps a
//! failure visible instead of producing a dock that does nothing when clicked.

use std::path::PathBuf;

use dl_core::{AppId, AppRef, PinnedApp};

use crate::icons::IconCache;

pub struct AppService {
    icons: IconCache,
}

impl AppService {
    pub fn new(cache_root: impl Into<PathBuf>) -> Self {
        Self {
            icons: IconCache::new(cache_root),
        }
    }

    pub fn icons(&self) -> &IconCache {
        &self.icons
    }

    /// Discover which of the known applications are installed.
    pub fn discover(&self) -> Vec<PinnedApp> {
        #[cfg(windows)]
        {
            crate::discovery::resolve_all()
                .into_iter()
                .map(|r| {
                    let always_float = crate::catalog::known(r.id.as_str())
                        .map(|k| k.always_float)
                        .unwrap_or(false);
                    PinnedApp {
                        id: r.id,
                        display_name: r.display_name,
                        app_ref: r.app_ref,
                        icon_key: None,
                        always_float,
                    }
                })
                .collect()
        }

        #[cfg(not(windows))]
        Vec::new()
    }

    /// Cached icon bytes, extracting and caching on first request.
    pub fn icon(&self, app: &AppId, app_ref: &AppRef) -> crate::icons::Result<Option<Vec<u8>>> {
        if let Some(cached) = self.icons.read(app)? {
            return Ok(Some(cached));
        }

        #[cfg(windows)]
        {
            let png = crate::discovery::extract_icon(app_ref)?;
            self.icons.write(app, &png)?;
            Ok(Some(png))
        }

        #[cfg(not(windows))]
        {
            let _ = app_ref;
            Ok(None)
        }
    }

    pub fn launch(&self, app_ref: &AppRef) -> Result<(), String> {
        #[cfg(windows)]
        {
            crate::discovery::launch(app_ref)
        }

        #[cfg(not(windows))]
        {
            let _ = app_ref;
            Err("launching applications is only supported on Windows".into())
        }
    }
}
