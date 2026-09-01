//! Turning cumulative counters into per-second rates.
//!
//! Network and disk counters are monotonic totals since boot, so a rate is a
//! delta over elapsed time. Three cases make that less trivial than it sounds,
//! and each produces a visibly wrong graph if mishandled:
//!
//! - **The first sample** has nothing to subtract from. Reporting the raw total
//!   would spike the graph to gigabytes per second on the first frame.
//! - **A counter can go backwards** — an adapter resets, a 32-bit counter
//!   wraps, or a disk is unplugged and replaced. Subtracting yields a huge
//!   negative, and as unsigned arithmetic a preposterous positive.
//! - **Elapsed time can be zero** if two samples land in the same millisecond,
//!   which divides by zero.
//!
//! All three resolve to zero rather than a guess: a momentary flat spot is
//! honest, a fabricated spike is not.

use std::collections::HashMap;

/// A cumulative counter and when it was read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Reading {
    value: u64,
    at_ms: u64,
}

/// Tracks counters by key and converts successive readings into rates.
#[derive(Debug, Default, Clone)]
pub struct RateTracker {
    previous: HashMap<String, Reading>,
}

impl RateTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Record `value` for `key` at `at_ms` and return the per-second rate since
    /// the previous reading.
    pub fn rate(&mut self, key: &str, value: u64, at_ms: u64) -> u64 {
        let previous = self
            .previous
            .insert(key.to_string(), Reading { value, at_ms });

        let Some(prev) = previous else {
            // First sample: the total since boot is not a rate.
            return 0;
        };

        // A counter that went backwards means a reset or wrap. There is no
        // honest rate to report for that interval.
        let Some(delta) = value.checked_sub(prev.value) else {
            return 0;
        };

        let elapsed_ms = at_ms.saturating_sub(prev.at_ms);
        if elapsed_ms == 0 {
            return 0;
        }

        // u128 because delta * 1000 overflows u64 for a large enough interval
        // on a 10GbE link.
        ((delta as u128 * 1_000) / elapsed_ms as u128) as u64
    }

    /// Forget a counter, so a device that reappears is treated as new rather
    /// than producing a spike from a stale baseline.
    pub fn forget(&mut self, key: &str) {
        self.previous.remove(key);
    }

    /// Drop every counter not in `keys`. Called each sample so unplugged
    /// devices do not accumulate.
    pub fn retain_only(&mut self, keys: &[String]) {
        self.previous.retain(|k, _| keys.contains(k));
    }

    pub fn tracked(&self) -> usize {
        self.previous.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_first_sample_reports_no_rate() {
        let mut t = RateTracker::new();

        // Bytes since boot is a large number; reporting it would spike the
        // graph to gigabytes per second on the very first frame.
        assert_eq!(t.rate("eth0-rx", 8_000_000_000, 1_000), 0);
    }

    #[test]
    fn a_steady_stream_reports_bytes_per_second() {
        let mut t = RateTracker::new();
        t.rate("eth0-rx", 1_000_000, 1_000);

        // 500 KB more, one second later.
        assert_eq!(t.rate("eth0-rx", 1_500_000, 2_000), 500_000);
    }

    #[test]
    fn a_sub_second_interval_is_scaled_up_correctly() {
        let mut t = RateTracker::new();
        t.rate("disk-read", 0, 0);

        // 100 KB in 250ms is 400 KB/s.
        assert_eq!(t.rate("disk-read", 100_000, 250), 400_000);
    }

    #[test]
    fn a_counter_reset_reports_zero_rather_than_a_spike() {
        // An adapter reset or a 32-bit wrap. Unsigned subtraction would
        // otherwise produce an astronomically large "rate".
        let mut t = RateTracker::new();
        t.rate("eth0-rx", 5_000_000, 1_000);

        assert_eq!(t.rate("eth0-rx", 1_000, 2_000), 0);
    }

    #[test]
    fn two_samples_in_the_same_millisecond_do_not_divide_by_zero() {
        let mut t = RateTracker::new();
        t.rate("eth0-rx", 1_000, 5_000);

        assert_eq!(t.rate("eth0-rx", 2_000, 5_000), 0);
    }

    #[test]
    fn a_high_throughput_interval_does_not_overflow() {
        // 10GbE for ten seconds: delta * 1000 exceeds u64 if computed in u64.
        let mut t = RateTracker::new();
        t.rate("eth0-rx", 0, 0);

        let ten_seconds_at_10gbe = 12_500_000_000u64;
        assert_eq!(
            t.rate("eth0-rx", ten_seconds_at_10gbe, 10_000),
            1_250_000_000
        );
    }

    #[test]
    fn counters_are_tracked_independently() {
        let mut t = RateTracker::new();
        t.rate("rx", 0, 0);
        t.rate("tx", 0, 0);

        assert_eq!(t.rate("rx", 1_000, 1_000), 1_000);
        assert_eq!(t.rate("tx", 5_000, 1_000), 5_000);
    }

    #[test]
    fn a_device_that_reappears_starts_fresh() {
        // Otherwise the stale baseline from before it was unplugged produces
        // one enormous spike on reconnection.
        let mut t = RateTracker::new();
        t.rate("usb-disk", 1_000_000, 1_000);

        t.forget("usb-disk");

        assert_eq!(t.rate("usb-disk", 9_000_000, 2_000), 0);
    }

    #[test]
    fn unplugged_devices_are_dropped_from_tracking() {
        let mut t = RateTracker::new();
        t.rate("eth0", 0, 0);
        t.rate("wifi0", 0, 0);
        t.rate("usb-disk", 0, 0);

        t.retain_only(&["eth0".to_string(), "wifi0".to_string()]);

        assert_eq!(t.tracked(), 2);
    }
}
