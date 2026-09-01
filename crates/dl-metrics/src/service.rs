//! The sampling service.
//!
//! Owns the sampler, the GPU sources and the ring buffer, so the caller only
//! has to call [`MetricsService::tick`] on an interval. Keeping history here
//! rather than in the panel is what lets the telemetry tile be remounted — by a
//! layout edit, a display change, a migration to another monitor — without
//! losing the graph.

use std::sync::{Arc, Mutex};

use dl_core::{MetricsSnapshot, TelemetryConfig};

use crate::gpu::GpuSampler;
use crate::history::History;
use crate::sampler::{Sampler, MINIMUM_CPU_INTERVAL_MS};

pub struct MetricsService {
    sampler: Sampler,
    gpu: GpuSampler,
    history: History,
    interval_ms: u64,
}

impl MetricsService {
    pub fn new(config: &TelemetryConfig) -> Self {
        Self {
            sampler: Sampler::new(),
            gpu: GpuSampler::new(),
            history: History::new(config.history_samples as usize),
            // Clamped rather than trusted: a hand-edited config asking for 10ms
            // would produce CPU figures that are pure noise.
            interval_ms: (config.sample_interval_ms as u64).max(MINIMUM_CPU_INTERVAL_MS),
        }
    }

    pub fn interval_ms(&self) -> u64 {
        self.interval_ms
    }

    /// Take one sample and retain it. Returns the snapshot just taken.
    pub fn tick(&mut self) -> MetricsSnapshot {
        let mut snapshot = self.sampler.sample(Sampler::now_ms());
        snapshot.gpus = self.gpu.sample();

        self.history.push(snapshot.clone());
        snapshot
    }

    pub fn latest(&self) -> Option<&MetricsSnapshot> {
        self.history.latest()
    }

    pub fn recent(&self, count: usize) -> Vec<MetricsSnapshot> {
        self.history.recent(count)
    }

    pub fn history_len(&self) -> usize {
        self.history.len()
    }

    /// Apply a changed telemetry config without discarding history.
    pub fn reconfigure(&mut self, config: &TelemetryConfig) {
        self.history.set_capacity(config.history_samples as usize);
        self.interval_ms = (config.sample_interval_ms as u64).max(MINIMUM_CPU_INTERVAL_MS);
    }
}

/// Shared handle for the sampling thread and the IPC commands.
pub type SharedMetrics = Arc<Mutex<MetricsService>>;

pub fn shared(config: &TelemetryConfig) -> SharedMetrics {
    Arc::new(Mutex::new(MetricsService::new(config)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_tick_produces_a_sample_and_retains_it() {
        let mut service = MetricsService::new(&TelemetryConfig::default());

        service.tick();

        assert_eq!(service.history_len(), 1);
        assert!(service.latest().is_some());
    }

    #[test]
    fn history_accumulates_across_ticks() {
        let mut service = MetricsService::new(&TelemetryConfig::default());

        for _ in 0..3 {
            service.tick();
        }

        assert_eq!(service.history_len(), 3);
        assert_eq!(service.recent(2).len(), 2);
    }

    #[test]
    fn an_interval_below_the_cpu_minimum_is_clamped() {
        // A hand-edited config asking for 10ms would make every CPU figure
        // noise; the sampler cannot measure faster than sysinfo's delta window.
        let service = MetricsService::new(&TelemetryConfig {
            sample_interval_ms: 10,
            ..Default::default()
        });

        assert_eq!(service.interval_ms(), MINIMUM_CPU_INTERVAL_MS);
    }

    #[test]
    fn a_reasonable_interval_is_left_alone() {
        let service = MetricsService::new(&TelemetryConfig {
            sample_interval_ms: 1_000,
            ..Default::default()
        });

        assert_eq!(service.interval_ms(), 1_000);
    }

    #[test]
    fn reconfiguring_keeps_the_history_already_collected() {
        // Changing the retention setting should not blank the graph you are
        // looking at while you change it.
        let mut service = MetricsService::new(&TelemetryConfig::default());
        for _ in 0..5 {
            service.tick();
        }

        service.reconfigure(&TelemetryConfig {
            history_samples: 600,
            sample_interval_ms: 2_000,
            ..Default::default()
        });

        assert_eq!(service.history_len(), 5);
        assert_eq!(service.interval_ms(), 2_000);
    }

    #[test]
    fn shrinking_retention_keeps_the_newest_samples() {
        let mut service = MetricsService::new(&TelemetryConfig::default());
        for _ in 0..10 {
            service.tick();
        }
        let newest = service.latest().expect("a sample").timestamp_ms;

        service.reconfigure(&TelemetryConfig {
            history_samples: 3,
            ..Default::default()
        });

        assert_eq!(service.history_len(), 3);
        assert_eq!(service.latest().expect("a sample").timestamp_ms, newest);
    }
}
