//! CPU, memory, disk and network sampling via `sysinfo`.
//!
//! One caveat governs the whole module: **`sysinfo` computes CPU load as a
//! delta between refreshes**, so the first refresh after construction reports
//! zero and any two refreshes closer together than
//! [`MINIMUM_CPU_INTERVAL_MS`] report noise. The sampler owns its own
//! `System` across calls for exactly that reason, and refuses to recompute CPU
//! faster than the interval rather than emitting a figure it knows is wrong.

use std::time::{SystemTime, UNIX_EPOCH};

use dl_core::{CpuMetrics, DiskMetrics, MemoryMetrics, MetricsSnapshot, NetworkMetrics};
use sysinfo::{Disks, Networks, System};

use crate::rates::RateTracker;

/// Below this, `sysinfo`'s CPU deltas are noise rather than measurement.
pub const MINIMUM_CPU_INTERVAL_MS: u64 = 200;

pub struct Sampler {
    system: System,
    disks: Disks,
    networks: Networks,
    rates: RateTracker,
    /// When CPU was last refreshed, to honour the minimum interval.
    last_cpu_refresh_ms: Option<u64>,
    /// Retained so a sample taken too soon reports the previous figure rather
    /// than a fabricated zero.
    last_cpu: CpuMetrics,
}

impl Default for Sampler {
    fn default() -> Self {
        Self::new()
    }
}

impl Sampler {
    pub fn new() -> Self {
        let mut system = System::new();
        system.refresh_cpu_all();
        system.refresh_memory();

        Self {
            system,
            disks: Disks::new_with_refreshed_list(),
            networks: Networks::new_with_refreshed_list(),
            rates: RateTracker::new(),
            last_cpu_refresh_ms: None,
            last_cpu: CpuMetrics::default(),
        }
    }

    /// Take a snapshot at `now_ms`.
    pub fn sample(&mut self, now_ms: u64) -> MetricsSnapshot {
        MetricsSnapshot {
            timestamp_ms: now_ms,
            cpu: self.sample_cpu(now_ms),
            memory: self.sample_memory(),
            disks: self.sample_disks(now_ms),
            network: self.sample_network(now_ms),
            gpus: Vec::new(),
        }
    }

    /// Wall-clock milliseconds, the clock rates are computed against.
    pub fn now_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }

    fn sample_cpu(&mut self, now_ms: u64) -> CpuMetrics {
        let too_soon = self
            .last_cpu_refresh_ms
            .is_some_and(|last| now_ms.saturating_sub(last) < MINIMUM_CPU_INTERVAL_MS);

        if too_soon {
            // Repeating the last real measurement beats publishing noise.
            return self.last_cpu.clone();
        }

        self.system.refresh_cpu_all();
        self.last_cpu_refresh_ms = Some(now_ms);

        let cpus = self.system.cpus();
        let per_core: Vec<f32> = cpus.iter().map(|c| c.cpu_usage() / 100.0).collect();

        // sysinfo's global_cpu_usage is itself an average, but averaging the
        // per-core figures keeps the total consistent with the bars beside it.
        let total = if per_core.is_empty() {
            0.0
        } else {
            per_core.iter().sum::<f32>() / per_core.len() as f32
        };

        self.last_cpu = CpuMetrics {
            name: cpus
                .first()
                .map(|c| c.brand().trim().to_string())
                .unwrap_or_default(),
            total,
            per_core,
            frequency_mhz: cpus.first().map(|c| c.frequency()).unwrap_or(0),
            physical_cores: self.system.physical_core_count().unwrap_or(0) as u32,
            logical_cores: cpus.len() as u32,
        };

        self.last_cpu.clone()
    }

    fn sample_memory(&mut self) -> MemoryMetrics {
        self.system.refresh_memory();

        MemoryMetrics {
            used_bytes: self.system.used_memory(),
            total_bytes: self.system.total_memory(),
            swap_used_bytes: self.system.used_swap(),
            swap_total_bytes: self.system.total_swap(),
        }
    }

    fn sample_disks(&mut self, now_ms: u64) -> Vec<DiskMetrics> {
        self.disks.refresh(true);

        self.disks
            .list()
            .iter()
            .map(|disk| {
                let mount = disk.mount_point().to_string_lossy().into_owned();
                let usage = disk.usage();

                DiskMetrics {
                    name: disk.name().to_string_lossy().into_owned(),
                    read_bytes_per_sec: self.rates.rate(
                        &format!("disk-r:{mount}"),
                        usage.total_read_bytes,
                        now_ms,
                    ),
                    write_bytes_per_sec: self.rates.rate(
                        &format!("disk-w:{mount}"),
                        usage.total_written_bytes,
                        now_ms,
                    ),
                    used_bytes: disk.total_space().saturating_sub(disk.available_space()),
                    total_bytes: disk.total_space(),
                    mount,
                }
            })
            .collect()
    }

    fn sample_network(&mut self, now_ms: u64) -> NetworkMetrics {
        self.networks.refresh(true);

        // Interfaces are summed rather than reported individually: the tile
        // shows one throughput figure, and which adapter carried the traffic is
        // not something you act on at a glance.
        let (mut rx_total, mut tx_total) = (0u64, 0u64);
        for data in self.networks.list().values() {
            rx_total = rx_total.saturating_add(data.total_received());
            tx_total = tx_total.saturating_add(data.total_transmitted());
        }

        NetworkMetrics {
            rx_bytes_per_sec: self.rates.rate("net-rx", rx_total, now_ms),
            tx_bytes_per_sec: self.rates.rate("net-tx", tx_total, now_ms),
            rx_total_bytes: rx_total,
            tx_total_bytes: tx_total,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_sample_reports_plausible_memory_for_this_machine() {
        let mut sampler = Sampler::new();
        let snapshot = sampler.sample(Sampler::now_ms());

        assert!(
            snapshot.memory.total_bytes > 0,
            "total memory should be readable on any host the tests run on"
        );
        assert!(snapshot.memory.used_bytes <= snapshot.memory.total_bytes);
        assert!((0.0..=1.0).contains(&snapshot.memory.fraction()));
    }

    #[test]
    fn cpu_load_stays_within_range_and_reports_every_core() {
        let mut sampler = Sampler::new();
        let first = Sampler::now_ms();
        sampler.sample(first);

        // Past the minimum interval, so this is a real measurement.
        let snapshot = sampler.sample(first + MINIMUM_CPU_INTERVAL_MS + 50);

        assert!(!snapshot.cpu.per_core.is_empty());
        assert_eq!(
            snapshot.cpu.logical_cores as usize,
            snapshot.cpu.per_core.len()
        );
        for load in &snapshot.cpu.per_core {
            assert!(
                (0.0..=1.0).contains(load),
                "core load {load} outside 0..1 — a raw percentage leaked through"
            );
        }
        assert!((0.0..=1.0).contains(&snapshot.cpu.total));
    }

    #[test]
    fn sampling_faster_than_the_minimum_interval_repeats_the_last_measurement() {
        // sysinfo computes CPU as a delta between refreshes; refreshing twice
        // in quick succession yields noise, so the sampler declines.
        let mut sampler = Sampler::new();
        let t = Sampler::now_ms();
        sampler.sample(t);
        let a = sampler.sample(t + MINIMUM_CPU_INTERVAL_MS + 50);
        let b = sampler.sample(t + MINIMUM_CPU_INTERVAL_MS + 60);

        assert_eq!(
            a.cpu.per_core, b.cpu.per_core,
            "a sample taken too soon must repeat rather than publish noise"
        );
    }

    #[test]
    fn the_first_sample_reports_no_network_rate() {
        // The counter is a total since boot; treating it as a rate would spike
        // the graph to gigabytes per second on the first frame.
        let mut sampler = Sampler::new();
        let snapshot = sampler.sample(Sampler::now_ms());

        assert_eq!(snapshot.network.rx_bytes_per_sec, 0);
        assert_eq!(snapshot.network.tx_bytes_per_sec, 0);
    }

    #[test]
    fn disks_report_usage_within_their_capacity() {
        let mut sampler = Sampler::new();
        let snapshot = sampler.sample(Sampler::now_ms());

        for disk in &snapshot.disks {
            assert!(
                disk.used_bytes <= disk.total_bytes,
                "{} reports {} used of {}",
                disk.mount,
                disk.used_bytes,
                disk.total_bytes
            );
        }
    }

    #[test]
    fn timestamps_are_carried_through_unchanged() {
        // Rates are computed against these, so a sampler rewriting them would
        // silently break every rate.
        let mut sampler = Sampler::new();
        assert_eq!(sampler.sample(12_345).timestamp_ms, 12_345);
    }
}
