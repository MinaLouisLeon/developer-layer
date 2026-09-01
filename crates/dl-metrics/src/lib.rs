//! Telemetry sampling.
//!
//! Sampling runs on one Rust thread into a ring buffer, with the frontend
//! receiving deltas over Tauri events rather than polling. History therefore
//! survives panel remounts and display hot-plug.
//!
//! GPU coverage is deliberately layered, because no single API spans vendors:
//!
//! - `DXGI EnumAdapterByGpuPreference` enumerates adapters with LUID and VRAM,
//!   which is how the integrated and dedicated GPUs appear as distinct devices.
//! - PDH counters (`\\GPU Engine(*)\\Utilization Percentage`) give utilisation
//!   and VRAM for every vendor. Instance names embed the LUID, matched back to
//!   DXGI. This is what Task Manager itself uses.
//! - NVML enriches NVIDIA adapters with temperature, power, clocks and fans.
//!
//! CPU temperature is intentionally absent: reading it on Ryzen needs a ring-0
//! driver, and the usual one carries a CVE and is blocked by several AV products.

#![doc(html_no_source)]
