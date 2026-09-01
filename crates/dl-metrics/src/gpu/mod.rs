//! GPU telemetry.
//!
//! Adapters are discovered per platform, then enriched by NVML where the vendor
//! supports it. Everything a source cannot measure stays `None` rather than
//! defaulting to zero — an integrated GPU reporting 0°C would look like a
//! measurement rather than a gap.

use dl_core::GpuMetrics;

#[cfg(windows)]
mod windows;

mod nvidia;

/// Enumerate adapters and fill in everything available on this platform.
pub struct GpuSampler {
    #[cfg(windows)]
    adapters: Vec<windows::Adapter>,
    nvidia: nvidia::NvidiaSource,
}

impl Default for GpuSampler {
    fn default() -> Self {
        Self::new()
    }
}

impl GpuSampler {
    pub fn new() -> Self {
        Self {
            #[cfg(windows)]
            adapters: windows::enumerate().unwrap_or_default(),
            nvidia: nvidia::NvidiaSource::new(),
        }
    }

    /// Whether an NVIDIA driver was found, for the settings UI to report why
    /// temperature and power are unavailable.
    pub fn nvidia_available(&self) -> bool {
        self.nvidia.is_available()
    }

    /// Sample every adapter.
    ///
    /// On non-Windows hosts only NVML is available, which is enough to keep the
    /// pipeline honest in tests without pretending DXGI exists.
    pub fn sample(&mut self) -> Vec<GpuMetrics> {
        #[cfg(windows)]
        let mut gpus = windows::sample(&self.adapters);

        #[cfg(not(windows))]
        let mut gpus: Vec<GpuMetrics> = Vec::new();

        self.nvidia.enrich(&mut gpus);
        gpus
    }
}
