//! Application resolution.
//!
//! Resolves the pinned applications to something launchable, which is not
//! uniform: most resolve through the registry `App Paths` key, but MSIX Store
//! apps such as WhatsApp have no executable path and open only via
//! `shell:AppsFolder\<AUMID>`.
//!
//! Enumerating the `AppsFolder` shell namespace yields the canonical list
//! including AUMIDs, and those same shell items produce 256px icons through
//! `IShellItemImageFactory` — so packaged and unpackaged apps share one path.

pub mod catalog;
pub mod icons;
pub mod launch;
pub mod service;
pub mod squirrel;

#[cfg(windows)]
mod discovery;

pub use catalog::{known, KnownApp, Resolved, Strategy, KNOWN_APPS};
pub use icons::IconCache;
pub use launch::LaunchPlan;
pub use service::AppService;

#[cfg(windows)]
pub use discovery::{activate, extract_icon, launch, resolve_all, spawn};
