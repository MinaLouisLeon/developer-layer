//! Domain types for Developer Layer.
//!
//! Rust owns every domain type; TypeScript is generated from these definitions
//! via `ts-rs` so the two sides cannot drift. Run `npm run gen:types` to refresh
//! the generated bindings under `apps/ui/shared/src/generated/`.
//!
//! This crate is deliberately platform-free — it compiles and tests anywhere,
//! including Linux CI. Only `dl-platform-win` touches an `HWND`.

pub mod app;
pub mod attributes;
pub mod config;
pub mod dock;
pub mod geometry;
pub mod metrics;
pub mod monitor;
pub mod slot;
pub mod window;

pub use app::{AppId, AppRef, PinnedApp};
pub use attributes::{FramePadding, WindowAttributes};
pub use config::{AtlasConfig, Config, TelemetryConfig};
pub use dock::{DockAction, DockEntry, DockWindow};
pub use geometry::{NormalizedRect, Rect};
pub use metrics::{
    CpuMetrics, DiskMetrics, GpuKind, GpuMetrics, GpuVendor, MemoryMetrics, MetricsSnapshot,
    NetworkMetrics,
};
pub use monitor::{DisplaySet, Monitor, MonitorId};
pub use slot::{LayoutError, Slot, SlotId, SlotLayout};
pub use window::{MinimizeReason, TileMode, WindowId, WindowRecord};
