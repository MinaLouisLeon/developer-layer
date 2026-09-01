//! Sample history.
//!
//! The ring buffer lives in Rust rather than in the panel's React state. That
//! is the whole point: the telemetry tile is remounted whenever a display is
//! plugged in or the layout changes, and losing five minutes of graph every
//! time you dock would make the history worthless exactly when you want it.

use std::collections::VecDeque;

use dl_core::MetricsSnapshot;

/// Fixed-capacity ring of snapshots, oldest first.
#[derive(Debug, Clone)]
pub struct History {
    samples: VecDeque<MetricsSnapshot>,
    capacity: usize,
}

impl History {
    /// `capacity` samples. At the default 1Hz, 300 is five minutes.
    ///
    /// A capacity of zero is coerced to one: a history that holds nothing would
    /// make `latest()` permanently `None` and silently blank every graph.
    pub fn new(capacity: usize) -> Self {
        let capacity = capacity.max(1);
        Self {
            samples: VecDeque::with_capacity(capacity),
            capacity,
        }
    }

    pub fn push(&mut self, sample: MetricsSnapshot) {
        if self.samples.len() == self.capacity {
            self.samples.pop_front();
        }
        self.samples.push_back(sample);
    }

    pub fn latest(&self) -> Option<&MetricsSnapshot> {
        self.samples.back()
    }

    pub fn len(&self) -> usize {
        self.samples.len()
    }

    pub fn is_empty(&self) -> bool {
        self.samples.is_empty()
    }

    pub fn capacity(&self) -> usize {
        self.capacity
    }

    /// Every retained sample, oldest first.
    pub fn samples(&self) -> impl Iterator<Item = &MetricsSnapshot> {
        self.samples.iter()
    }

    /// The most recent `count` samples, oldest first.
    ///
    /// Used by the UI to draw a sparkline narrower than the full buffer without
    /// shipping the whole history over IPC on every frame.
    pub fn recent(&self, count: usize) -> Vec<MetricsSnapshot> {
        let skip = self.samples.len().saturating_sub(count);
        self.samples.iter().skip(skip).cloned().collect()
    }

    /// Resize while keeping the newest samples.
    ///
    /// Shrinking discards the oldest, which is what a user lowering the
    /// retention setting expects — not losing the data they are looking at.
    pub fn set_capacity(&mut self, capacity: usize) {
        self.capacity = capacity.max(1);
        while self.samples.len() > self.capacity {
            self.samples.pop_front();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dl_core::{CpuMetrics, MemoryMetrics, NetworkMetrics};

    fn sample(at_ms: u64) -> MetricsSnapshot {
        MetricsSnapshot {
            timestamp_ms: at_ms,
            cpu: CpuMetrics::default(),
            memory: MemoryMetrics::default(),
            disks: Vec::new(),
            network: NetworkMetrics::default(),
            gpus: Vec::new(),
        }
    }

    #[test]
    fn samples_come_back_oldest_first() {
        let mut h = History::new(10);
        for t in 0..3 {
            h.push(sample(t));
        }

        let times: Vec<u64> = h.samples().map(|s| s.timestamp_ms).collect();
        assert_eq!(times, vec![0, 1, 2]);
    }

    #[test]
    fn the_oldest_sample_is_evicted_at_capacity() {
        let mut h = History::new(3);
        for t in 0..5 {
            h.push(sample(t));
        }

        assert_eq!(h.len(), 3);
        let times: Vec<u64> = h.samples().map(|s| s.timestamp_ms).collect();
        assert_eq!(times, vec![2, 3, 4]);
    }

    #[test]
    fn latest_is_the_most_recent_push() {
        let mut h = History::new(5);
        h.push(sample(100));
        h.push(sample(200));

        assert_eq!(h.latest().map(|s| s.timestamp_ms), Some(200));
    }

    #[test]
    fn an_empty_history_has_no_latest() {
        assert!(History::new(10).latest().is_none());
    }

    #[test]
    fn a_zero_capacity_still_holds_one_sample() {
        // Otherwise latest() is permanently None and every graph blanks out.
        let mut h = History::new(0);
        h.push(sample(1));

        assert_eq!(h.capacity(), 1);
        assert!(h.latest().is_some());
    }

    #[test]
    fn recent_returns_the_newest_samples() {
        let mut h = History::new(100);
        for t in 0..10 {
            h.push(sample(t));
        }

        let times: Vec<u64> = h.recent(3).iter().map(|s| s.timestamp_ms).collect();
        assert_eq!(times, vec![7, 8, 9]);
    }

    #[test]
    fn asking_for_more_than_exists_returns_everything() {
        let mut h = History::new(100);
        h.push(sample(1));

        assert_eq!(h.recent(50).len(), 1);
    }

    #[test]
    fn shrinking_capacity_keeps_the_newest_samples() {
        // Lowering the retention setting should not discard what you are
        // currently looking at.
        let mut h = History::new(10);
        for t in 0..10 {
            h.push(sample(t));
        }

        h.set_capacity(3);

        let times: Vec<u64> = h.samples().map(|s| s.timestamp_ms).collect();
        assert_eq!(times, vec![7, 8, 9]);
    }

    #[test]
    fn growing_capacity_keeps_everything_already_held() {
        let mut h = History::new(3);
        for t in 0..3 {
            h.push(sample(t));
        }

        h.set_capacity(10);

        assert_eq!(h.len(), 3);
        h.push(sample(3));
        assert_eq!(h.len(), 4);
    }
}
