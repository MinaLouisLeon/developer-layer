//! Telemetry domain types.
//!
//! GPU fields are deliberately `Option`. No single API spans vendors: PDH
//! counters give utilisation and VRAM for every adapter, while temperature,
//! power, clocks and fans come from NVML and exist only on NVIDIA. Modelling
//! the gaps as `None` means the tile can render "—" for what it genuinely
//! cannot know, instead of a zero that reads as a real measurement.
//!
//! CPU temperature is absent entirely rather than optional: reading it on Ryzen
//! needs a ring-0 driver, the usual one carries a CVE and is blocked by several
//! AV products, and an always-`None` field would just invite someone to try.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct MetricsSnapshot {
    /// Milliseconds since the Unix epoch. Used to compute rates between
    /// samples, so it must come from a wall clock the caller also uses.
    pub timestamp_ms: u64,
    pub cpu: CpuMetrics,
    pub memory: MemoryMetrics,
    pub disks: Vec<DiskMetrics>,
    pub network: NetworkMetrics,
    pub gpus: Vec<GpuMetrics>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct CpuMetrics {
    pub name: String,
    /// Aggregate load, 0.0 to 1.0.
    pub total: f32,
    /// Per-logical-core load, 0.0 to 1.0.
    pub per_core: Vec<f32>,
    pub frequency_mhz: u64,
    pub physical_cores: u32,
    pub logical_cores: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct MemoryMetrics {
    pub used_bytes: u64,
    pub total_bytes: u64,
    pub swap_used_bytes: u64,
    pub swap_total_bytes: u64,
}

impl MemoryMetrics {
    /// Fraction used, 0.0 to 1.0. Zero when total is unknown rather than NaN,
    /// which would poison every gauge that touched it.
    pub fn fraction(&self) -> f32 {
        if self.total_bytes == 0 {
            0.0
        } else {
            self.used_bytes as f32 / self.total_bytes as f32
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct DiskMetrics {
    pub name: String,
    pub mount: String,
    pub used_bytes: u64,
    pub total_bytes: u64,
    pub read_bytes_per_sec: u64,
    pub write_bytes_per_sec: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct NetworkMetrics {
    pub rx_bytes_per_sec: u64,
    pub tx_bytes_per_sec: u64,
    /// Cumulative since boot, kept so the UI can show session totals.
    pub rx_total_bytes: u64,
    pub tx_total_bytes: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub enum GpuVendor {
    Nvidia,
    Amd,
    Intel,
    Other,
}

impl GpuVendor {
    /// Resolve from a PCI vendor ID as reported by DXGI.
    pub fn from_pci_id(id: u32) -> Self {
        match id {
            0x10DE => Self::Nvidia,
            0x1002 | 0x1022 => Self::Amd,
            0x8086 => Self::Intel,
            _ => Self::Other,
        }
    }

    /// Whether NVML can enrich this adapter beyond utilisation and VRAM.
    pub fn supports_full_telemetry(&self) -> bool {
        matches!(self, Self::Nvidia)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub enum GpuKind {
    Integrated,
    Discrete,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../apps/ui/shared/src/generated/")]
pub struct GpuMetrics {
    pub name: String,
    pub vendor: GpuVendor,
    pub kind: GpuKind,
    /// Adapter LUID as a string, joining the DXGI adapter to its PDH counters.
    pub luid: String,

    /// Available on every vendor via PDH.
    pub utilization: Option<f32>,
    pub vram_used_bytes: Option<u64>,
    pub vram_total_bytes: Option<u64>,

    /// NVIDIA only, via NVML. `None` elsewhere is a real gap, not a zero.
    pub temperature_c: Option<f32>,
    pub power_watts: Option<f32>,
    pub core_clock_mhz: Option<u32>,
    pub fan_percent: Option<f32>,
}

impl GpuMetrics {
    pub fn new(
        name: impl Into<String>,
        vendor: GpuVendor,
        kind: GpuKind,
        luid: impl Into<String>,
    ) -> Self {
        Self {
            name: name.into(),
            vendor,
            kind,
            luid: luid.into(),
            utilization: None,
            vram_used_bytes: None,
            vram_total_bytes: None,
            temperature_c: None,
            power_watts: None,
            core_clock_mhz: None,
            fan_percent: None,
        }
    }

    pub fn vram_fraction(&self) -> Option<f32> {
        match (self.vram_used_bytes, self.vram_total_bytes) {
            (Some(used), Some(total)) if total > 0 => Some(used as f32 / total as f32),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pci_ids_resolve_to_the_right_vendors() {
        assert_eq!(GpuVendor::from_pci_id(0x10DE), GpuVendor::Nvidia);
        assert_eq!(GpuVendor::from_pci_id(0x1002), GpuVendor::Amd);
        assert_eq!(GpuVendor::from_pci_id(0x8086), GpuVendor::Intel);
        assert_eq!(GpuVendor::from_pci_id(0x1234), GpuVendor::Other);
    }

    #[test]
    fn only_nvidia_offers_temperature_and_power() {
        // The tile renders "—" rather than 0 for the others, so this predicate
        // has to be honest about coverage.
        assert!(GpuVendor::Nvidia.supports_full_telemetry());
        assert!(!GpuVendor::Amd.supports_full_telemetry());
        assert!(!GpuVendor::Intel.supports_full_telemetry());
    }

    #[test]
    fn an_unmeasured_field_stays_none_rather_than_zero() {
        let igpu = GpuMetrics::new("Intel UHD", GpuVendor::Intel, GpuKind::Integrated, "0x1");

        assert_eq!(igpu.temperature_c, None, "a zero here would read as 0°C");
        assert_eq!(igpu.vram_fraction(), None);
    }

    #[test]
    fn memory_fraction_survives_a_zero_total() {
        // A NaN here would propagate into every gauge that touched it.
        assert_eq!(MemoryMetrics::default().fraction(), 0.0);
    }

    #[test]
    fn vram_fraction_needs_both_halves() {
        let mut gpu = GpuMetrics::new("RTX", GpuVendor::Nvidia, GpuKind::Discrete, "0x2");
        gpu.vram_used_bytes = Some(4 << 30);
        assert_eq!(
            gpu.vram_fraction(),
            None,
            "used without total is not a ratio"
        );

        gpu.vram_total_bytes = Some(8 << 30);
        assert_eq!(gpu.vram_fraction(), Some(0.5));
    }
}
