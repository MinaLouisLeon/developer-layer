//! NVML enrichment.
//!
//! NVML loads `nvml.dll` (or `libnvidia-ml.so`) at runtime rather than link
//! time, so this compiles and runs on machines with no NVIDIA hardware — it
//! simply finds nothing. That is why the whole crate builds on Linux CI.
//!
//! NVML is the only source here for temperature, power, clocks and fans. On a
//! machine with an NVIDIA dGPU and an Intel or AMD iGPU, the discrete card gets
//! the full picture and the integrated one keeps `None` in those fields, which
//! is the honest result rather than a zero.

use dl_core::{GpuMetrics, GpuVendor};
use nvml_wrapper::Nvml;

pub struct NvidiaSource {
    /// `None` when no NVIDIA driver is present. Initialised once: NVML init is
    /// expensive and would otherwise run on every sample.
    nvml: Option<Nvml>,
}

impl NvidiaSource {
    pub fn new() -> Self {
        Self {
            // Absence is the normal case on plenty of machines, not an error.
            nvml: Nvml::init().ok(),
        }
    }

    pub fn is_available(&self) -> bool {
        self.nvml.is_some()
    }

    /// Fill in NVIDIA-only fields on adapters this source recognises.
    ///
    /// Matching is by name: DXGI and NVML report the same marketing string for
    /// a given card, and NVML exposes no LUID to join on.
    pub fn enrich(&mut self, gpus: &mut Vec<GpuMetrics>) {
        let Some(nvml) = &self.nvml else {
            return;
        };

        let Ok(count) = nvml.device_count() else {
            return;
        };

        for index in 0..count {
            let Ok(device) = nvml.device_by_index(index) else {
                continue;
            };
            let name = device.name().unwrap_or_default();

            // Adapters DXGI never reported are added rather than dropped: on a
            // non-Windows host DXGI does not run at all, and losing the card
            // entirely would be worse than reporting it without a LUID.
            let slot = match gpus.iter_mut().find(|g| matches(&g.name, &name)) {
                Some(existing) => existing,
                None => {
                    gpus.push(GpuMetrics::new(
                        name.clone(),
                        GpuVendor::Nvidia,
                        dl_core::GpuKind::Discrete,
                        String::new(),
                    ));
                    gpus.last_mut().expect("just pushed")
                }
            };

            if let Ok(util) = device.utilization_rates() {
                slot.utilization = Some(util.gpu as f32 / 100.0);
            }
            if let Ok(mem) = device.memory_info() {
                slot.vram_used_bytes = Some(mem.used);
                slot.vram_total_bytes = Some(mem.total);
            }
            if let Ok(temp) =
                device.temperature(nvml_wrapper::enum_wrappers::device::TemperatureSensor::Gpu)
            {
                slot.temperature_c = Some(temp as f32);
            }
            if let Ok(milliwatts) = device.power_usage() {
                slot.power_watts = Some(milliwatts as f32 / 1_000.0);
            }
            if let Ok(clock) =
                device.clock_info(nvml_wrapper::enum_wrappers::device::Clock::Graphics)
            {
                slot.core_clock_mhz = Some(clock);
            }
            // Passively cooled and laptop cards report no fan; that is a gap,
            // not a zero-speed fan.
            if let Ok(fan) = device.fan_speed(0) {
                slot.fan_percent = Some(fan as f32 / 100.0);
            }
        }
    }
}

impl Default for NvidiaSource {
    fn default() -> Self {
        Self::new()
    }
}

/// Whether a DXGI adapter description and an NVML device name refer to the same
/// card. The two agree on the marketing name but differ in spacing and case.
fn matches(dxgi_name: &str, nvml_name: &str) -> bool {
    normalise(dxgi_name) == normalise(nvml_name)
}

fn normalise(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adapter_names_match_across_spacing_and_case() {
        assert!(matches(
            "NVIDIA GeForce RTX 4070 Laptop GPU",
            "NVIDIA GeForce RTX 4070 Laptop GPU"
        ));
        assert!(matches(
            "NVIDIA  GeForce RTX 4070",
            "nvidia geforce rtx 4070"
        ));
    }

    #[test]
    fn different_cards_do_not_match() {
        assert!(!matches(
            "NVIDIA GeForce RTX 4070",
            "NVIDIA GeForce RTX 4060"
        ));
        assert!(!matches("Intel UHD Graphics", "NVIDIA GeForce RTX 4070"));
    }

    #[test]
    fn enrichment_is_a_no_op_without_a_driver() {
        // The normal case on plenty of machines, and on this CI runner.
        let mut source = NvidiaSource { nvml: None };
        let mut gpus = vec![GpuMetrics::new(
            "Intel UHD",
            GpuVendor::Intel,
            dl_core::GpuKind::Integrated,
            "0x1",
        )];

        source.enrich(&mut gpus);

        assert_eq!(gpus.len(), 1);
        assert_eq!(gpus[0].temperature_c, None);
    }

    #[test]
    fn constructing_the_source_never_panics_without_nvidia_hardware() {
        let source = NvidiaSource::new();
        // Either outcome is valid; what matters is that it did not panic.
        let _ = source.is_available();
    }
}
