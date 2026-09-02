//! Getting a microphone's output into the shape the engines demand.
//!
//! Both of them want the same thing and neither will take anything else:
//! 16 kHz, mono, and Porcupine additionally wants it in fixed-length frames of
//! signed 16-bit samples. A microphone supplies none of that — 44.1 or 48 kHz,
//! usually stereo, usually `f32`.
//!
//! This is the module worth testing, because getting it wrong does not fail.
//! It produces a recording that plays back at the wrong speed, or one that
//! sounds fine to a person and is full of aliased rubbish to a model, and the
//! only symptom either way is that transcription is mysteriously poor.

/// What both engines require.
pub const TARGET_RATE: u32 = 16_000;

/// Collapse interleaved channels to mono by averaging.
///
/// Averaging rather than taking the first channel: on a stereo headset the
/// microphone is often wired to one side only, and picking the wrong one gives
/// silence.
pub fn to_mono(interleaved: &[f32], channels: u16) -> Vec<f32> {
    let channels = channels.max(1) as usize;
    if channels == 1 {
        return interleaved.to_vec();
    }

    interleaved
        .chunks_exact(channels)
        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
        .collect()
}

/// Cutoff of the anti-aliasing filter, a little under the 8 kHz Nyquist that
/// 16 kHz gives. The margin is the filter's transition band; putting the
/// cutoff *at* Nyquist would let the shoulder through.
const CUTOFF_HZ: f32 = 7_200.0;

/// Length of that filter. Odd, so it has a exact centre tap and a whole-sample
/// group delay. Sixty-three taps buy roughly 50 dB of stopband at a cost of a
/// million multiply-adds a second, which is nothing against what the model
/// that consumes this costs.
const TAPS: usize = 63;

/// Resample mono audio to [`TARGET_RATE`].
///
/// Downsampling low-passes first. Without that, everything above the new
/// 8 kHz Nyquist does not disappear — it folds back down into the speech band
/// as tones nobody said. That is the worst kind of fault to find: a person
/// listening to the recording hears something acceptable, and only the
/// recogniser's accuracy quietly suffers.
///
/// The obvious cheap filter, averaging each output sample's span of input, is
/// not enough to claim this. From 44.1 kHz that span is under three samples,
/// and a three-tap average still passes 9 kHz at 80% — straight into the
/// speech band at 7 kHz. Hence a real windowed-sinc.
///
/// Upsampling interpolates linearly instead. It is only reachable from an
/// 8 kHz telephony-grade device, where the missing information is simply not
/// there and nothing cleverer would invent it.
pub fn resample(input: &[f32], from_rate: u32) -> Vec<f32> {
    if from_rate == TARGET_RATE || input.is_empty() || from_rate == 0 {
        return input.to_vec();
    }

    let ratio = from_rate as f64 / TARGET_RATE as f64;
    let out_len = ((input.len() as f64) / ratio).floor() as usize;
    let mut out = Vec::with_capacity(out_len);

    if ratio > 1.0 {
        let kernel = low_pass(CUTOFF_HZ / from_rate as f32);
        let centre = (TAPS / 2) as isize;

        for i in 0..out_len {
            let at = (i as f64 * ratio).round() as isize;
            let mut sum = 0.0;
            for (k, tap) in kernel.iter().enumerate() {
                // Clamped at both ends rather than zero-padded: zeros would
                // put a step at the edges of every utterance, and a step is
                // broadband energy the filter was there to avoid.
                let index = (at + k as isize - centre).clamp(0, input.len() as isize - 1) as usize;
                sum += input[index] * tap;
            }
            out.push(sum);
        }
    } else {
        for i in 0..out_len {
            let position = i as f64 * ratio;
            let left = position as usize;
            let right = (left + 1).min(input.len() - 1);
            let t = (position - left as f64) as f32;
            out.push(input[left] * (1.0 - t) + input[right] * t);
        }
    }

    out
}

/// A Hamming-windowed sinc low-pass, normalised to unit gain at DC.
///
/// Normalising matters: without it the filter has an arbitrary gain and the
/// silence threshold in `dl-atlas` would be measuring something other than the
/// level the microphone reported.
fn low_pass(cutoff: f32) -> [f32; TAPS] {
    let mut kernel = [0.0f32; TAPS];
    let centre = (TAPS / 2) as f32;

    for (i, tap) in kernel.iter_mut().enumerate() {
        let x = i as f32 - centre;
        let sinc = if x == 0.0 {
            2.0 * cutoff
        } else {
            (std::f32::consts::TAU * cutoff * x).sin() / (std::f32::consts::PI * x)
        };
        let window = 0.54 - 0.46 * (std::f32::consts::TAU * i as f32 / (TAPS - 1) as f32).cos();
        *tap = sinc * window;
    }

    let gain: f32 = kernel.iter().sum();
    if gain != 0.0 {
        for tap in kernel.iter_mut() {
            *tap /= gain;
        }
    }
    kernel
}

/// Convert to signed 16-bit, which is the only form Porcupine accepts.
///
/// Clamped before scaling: a sample above 1.0 — which a hot microphone with
/// gain applied does produce — would otherwise wrap from full positive to full
/// negative and read as a click loud enough to trip the detector.
pub fn to_i16(samples: &[f32]) -> Vec<i16> {
    samples
        .iter()
        .map(|s| (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
        .collect()
}

/// Peak amplitude of a frame, for the silence rule in `dl-atlas`.
///
/// Peak rather than RMS: a single loud sample is speech starting, and an
/// average over the window would smear that onset into the silence around it.
pub fn peak(samples: &[f32]) -> f32 {
    samples.iter().fold(0.0f32, |peak, s| peak.max(s.abs()))
}

/// Accumulates one utterance, bounded.
///
/// The bound is not a nicety. Capture runs on the audio thread and the session
/// that would normally stop it lives elsewhere; if that side stalls, an
/// unbounded buffer grows until the process dies. Dropping the oldest audio
/// costs the start of an utterance that was already too long to be a command.
#[derive(Debug)]
pub struct Utterance {
    samples: Vec<f32>,
    capacity: usize,
}

impl Utterance {
    /// `seconds` at [`TARGET_RATE`].
    pub fn with_seconds(seconds: u32) -> Self {
        Self {
            samples: Vec::new(),
            capacity: seconds as usize * TARGET_RATE as usize,
        }
    }

    pub fn push(&mut self, samples: &[f32]) {
        self.samples.extend_from_slice(samples);
        if self.samples.len() > self.capacity {
            let excess = self.samples.len() - self.capacity;
            self.samples.drain(..excess);
        }
    }

    pub fn samples(&self) -> &[f32] {
        &self.samples
    }

    pub fn duration_ms(&self) -> u64 {
        (self.samples.len() as u64 * 1_000) / TARGET_RATE as u64
    }

    pub fn is_empty(&self) -> bool {
        self.samples.is_empty()
    }

    pub fn clear(&mut self) {
        self.samples.clear();
    }

    pub fn take(&mut self) -> Vec<f32> {
        std::mem::take(&mut self.samples)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::TAU;

    /// Peak away from the ends.
    ///
    /// The filter is 63 taps, so the first and last few milliseconds of any
    /// output carry its start-up and run-out transient. That is a real edge
    /// effect and it is irrelevant — four milliseconds at each end of an
    /// utterance — but it dominates a peak taken over the whole buffer, which
    /// would make these assertions measure the wrong thing.
    fn steady_peak(samples: &[f32]) -> f32 {
        let trim = 200.min(samples.len() / 4);
        peak(&samples[trim..samples.len() - trim])
    }

    /// `seconds` of a sine at `hz`, sampled at `rate`.
    fn tone(hz: f32, rate: u32, seconds: f32) -> Vec<f32> {
        let n = (rate as f32 * seconds) as usize;
        (0..n)
            .map(|i| (TAU * hz * i as f32 / rate as f32).sin())
            .collect()
    }

    #[test]
    fn a_microphone_wired_to_one_channel_is_not_silence() {
        // Common on a headset. Taking the first channel would give an empty
        // recording from a working microphone.
        let interleaved = vec![0.0, 0.8, 0.0, 0.6];
        let mono = to_mono(&interleaved, 2);
        assert_eq!(mono, vec![0.4, 0.3]);
    }

    #[test]
    fn mono_input_is_passed_through_untouched() {
        let samples = vec![0.1, -0.2, 0.3];
        assert_eq!(to_mono(&samples, 1), samples);
    }

    #[test]
    fn resampling_produces_the_duration_it_started_with() {
        // The failure this catches is audio that plays back at three times
        // speed, which is what naive 48k→16k does if the ratio is inverted.
        for rate in [8_000, 16_000, 22_050, 44_100, 48_000, 96_000] {
            let input = tone(440.0, rate, 1.0);
            let output = resample(&input, rate);
            let duration_ms = output.len() as f64 / TARGET_RATE as f64 * 1000.0;
            assert!(
                (duration_ms - 1000.0).abs() < 20.0,
                "{rate} Hz gave {duration_ms:.0}ms"
            );
        }
    }

    #[test]
    fn speech_band_content_survives_downsampling() {
        // 1 kHz is squarely inside speech. If this is attenuated the low-pass
        // is too aggressive and everything sounds muffled to the recogniser.
        let output = resample(&tone(1_000.0, 48_000, 0.5), 48_000);
        assert!(
            steady_peak(&output) > 0.9,
            "peak was {}",
            steady_peak(&output)
        );
    }

    #[test]
    fn content_above_the_new_nyquist_is_rejected_rather_than_folded_down() {
        // The whole reason there is a filter. 16 kHz puts Nyquist at 8 kHz, so
        // anything above that folds back into speech as a tone nobody said —
        // 12 kHz would land at 4 kHz, right in the middle of it.
        //
        // Both source rates are tested because they fail differently: from
        // 44.1 kHz the naive span is under three samples, so the cheap average
        // barely filters at all.
        for rate in [44_100, 48_000] {
            for hz in [12_000.0, 20_000.0] {
                if hz >= rate as f32 / 2.0 {
                    continue; // Not representable at the source either.
                }
                let aliased = steady_peak(&resample(&tone(hz, rate, 0.5), rate));
                assert!(
                    aliased < 0.05,
                    "{hz} Hz from {rate} came through at {aliased:.3}"
                );
            }
        }
    }

    #[test]
    fn the_filter_does_not_change_how_loud_the_recording_is() {
        // The silence threshold in dl-atlas measures the level this produces.
        // A filter with arbitrary gain would move that threshold with the
        // device's sample rate.
        for rate in [44_100, 48_000, 96_000] {
            let peak_out = steady_peak(&resample(&tone(300.0, rate, 0.3), rate));
            assert!(
                (peak_out - 1.0).abs() < 0.05,
                "{rate} Hz gave a peak of {peak_out:.3}"
            );
        }
    }

    #[test]
    fn a_matching_rate_is_not_touched_at_all() {
        let input = tone(440.0, TARGET_RATE, 0.1);
        assert_eq!(resample(&input, TARGET_RATE), input);
    }

    #[test]
    fn resampling_nothing_is_not_a_panic() {
        // Reachable when the stream is closed between frames.
        assert!(resample(&[], 48_000).is_empty());
        assert!(resample(&[0.5], 0).len() == 1);
    }

    #[test]
    fn a_hot_microphone_clips_rather_than_wrapping_to_a_click() {
        // Above 1.0 the naive cast wraps full positive to full negative, which
        // reads as an impulse loud enough to trip the wake detector.
        let converted = to_i16(&[1.4, -1.4, 0.0]);
        assert_eq!(converted, vec![i16::MAX, -i16::MAX, 0]);
    }

    #[test]
    fn peak_finds_a_single_loud_sample_in_a_quiet_frame() {
        // Speech starting. An RMS over the same frame would read as silence.
        let mut frame = vec![0.0; 512];
        frame[300] = -0.9;
        assert!((peak(&frame) - 0.9).abs() < 1e-6);
    }

    #[test]
    fn an_utterance_drops_the_oldest_audio_rather_than_growing_without_bound() {
        // The audio thread keeps pushing whether or not the session that would
        // stop it is still answering. Unbounded, that ends the process.
        let mut utterance = Utterance::with_seconds(1);
        utterance.push(&vec![0.1; TARGET_RATE as usize]);
        utterance.push(&vec![0.9; TARGET_RATE as usize / 2]);

        assert_eq!(utterance.samples().len(), TARGET_RATE as usize);
        assert_eq!(utterance.duration_ms(), 1_000);
        // The newest audio is what was kept.
        assert_eq!(utterance.samples().last(), Some(&0.9));
    }

    #[test]
    fn taking_an_utterance_leaves_it_ready_for_the_next_one() {
        let mut utterance = Utterance::with_seconds(2);
        utterance.push(&[0.5, 0.5]);
        assert_eq!(utterance.take(), vec![0.5, 0.5]);
        assert!(utterance.is_empty());
    }
}
