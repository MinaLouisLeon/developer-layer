//! Microphone capture through cpal.
//!
//! The audio callback runs on a real-time thread owned by the driver. Anything
//! slow or blocking in it produces dropouts in the recording, so it does the
//! minimum — convert, and hand the frame to a channel — and every decision
//! about what the audio *means* happens elsewhere.

use std::sync::mpsc::{sync_channel, Receiver, SyncSender, TrySendError};
use std::sync::{Arc, Mutex};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, StreamConfig};

use crate::audio;
use crate::{Ears, Result, VoiceError};

/// One frame of captured audio, already mono at 16 kHz.
pub struct Frame {
    pub samples: Vec<f32>,
    pub peak: f32,
}

/// How many frames may queue before the oldest are dropped.
///
/// Bounded because the callback must never block: if the consumer stalls, the
/// right answer is to lose audio, not to stall the driver's real-time thread
/// and produce a glitch across the whole system's playback.
const QUEUE_DEPTH: usize = 64;

pub struct Microphone {
    device: cpal::Device,
    config: StreamConfig,
    format: SampleFormat,
    /// Held to keep the stream alive; dropping it stops capture.
    stream: Option<cpal::Stream>,
    sender: SyncSender<Frame>,
    receiver: Arc<Mutex<Receiver<Frame>>>,
    /// Counted so a stall shows up in the log as a number rather than as
    /// "transcription is bad sometimes".
    dropped: Arc<std::sync::atomic::AtomicU64>,
}

// SAFETY: `cpal::Stream` is not `Send` on every backend because some drivers
// require it to be dropped on the thread that made it. This type owns its
// stream for its whole life and only ever creates and drops it from the voice
// thread; the handle is never moved between threads while a stream is open.
unsafe impl Send for Microphone {}

impl Microphone {
    /// Open the default input device.
    pub fn open() -> Result<Self> {
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or_else(|| VoiceError::NoInput("no default input device".into()))?;

        let supported = device
            .default_input_config()
            .map_err(|e| VoiceError::NoInput(e.to_string()))?;

        let format = supported.sample_format();
        let config: StreamConfig = supported.into();

        tracing::info!(
            device = device.name().unwrap_or_default(),
            rate = config.sample_rate.0,
            channels = config.channels,
            ?format,
            "microphone opened"
        );

        let (sender, receiver) = sync_channel(QUEUE_DEPTH);

        Ok(Self {
            device,
            config,
            format,
            stream: None,
            sender,
            receiver: Arc::new(Mutex::new(receiver)),
            dropped: Arc::new(std::sync::atomic::AtomicU64::new(0)),
        })
    }

    /// Frames captured so far, drained.
    pub fn drain(&self) -> Vec<Frame> {
        let Ok(receiver) = self.receiver.lock() else {
            return Vec::new();
        };
        receiver.try_iter().collect()
    }

    pub fn dropped_frames(&self) -> u64 {
        self.dropped.load(std::sync::atomic::Ordering::Relaxed)
    }

    fn build(&self) -> Result<cpal::Stream> {
        let sender = self.sender.clone();
        let dropped = Arc::clone(&self.dropped);
        let rate = self.config.sample_rate.0;
        let channels = self.config.channels;

        let on_error = |e| tracing::error!(%e, "the capture stream failed");

        let deliver = move |mono: Vec<f32>| {
            let frame = Frame {
                peak: audio::peak(&mono),
                samples: mono,
            };
            // `try_send`, never `send`: blocking here would stall the driver's
            // real-time thread.
            if let Err(TrySendError::Full(_)) = sender.try_send(frame) {
                dropped.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            }
        };

        let stream = match self.format {
            SampleFormat::F32 => self.device.build_input_stream(
                &self.config,
                move |data: &[f32], _| {
                    deliver(audio::resample(&audio::to_mono(data, channels), rate))
                },
                on_error,
                None,
            ),
            SampleFormat::I16 => self.device.build_input_stream(
                &self.config,
                move |data: &[i16], _| {
                    let floats: Vec<f32> =
                        data.iter().map(|s| *s as f32 / i16::MAX as f32).collect();
                    deliver(audio::resample(&audio::to_mono(&floats, channels), rate))
                },
                on_error,
                None,
            ),
            SampleFormat::U16 => self.device.build_input_stream(
                &self.config,
                move |data: &[u16], _| {
                    // Unsigned samples are centred on 32768, not on zero.
                    // Treating them as signed gives a permanent DC offset that
                    // reads as a level above the noise floor forever, so the
                    // session would never see silence.
                    let floats: Vec<f32> = data
                        .iter()
                        .map(|s| (*s as f32 - 32_768.0) / 32_768.0)
                        .collect();
                    deliver(audio::resample(&audio::to_mono(&floats, channels), rate))
                },
                on_error,
                None,
            ),
            other => {
                return Err(VoiceError::Capture(format!(
                    "this microphone reports samples as {other:?}, which is not supported"
                )))
            }
        };

        stream.map_err(|e| VoiceError::Capture(e.to_string()))
    }
}

impl Ears for Microphone {
    fn start(&mut self) -> Result<()> {
        if self.stream.is_some() {
            return Ok(());
        }
        let stream = self.build()?;
        stream
            .play()
            .map_err(|e| VoiceError::Capture(e.to_string()))?;
        self.stream = Some(stream);
        Ok(())
    }

    fn stop(&mut self) {
        // Dropping the stream closes the device, which is what turns the
        // operating system's microphone-in-use indicator off. Merely pausing
        // would leave it lit, and a light that stays on when the user believes
        // they stopped talking is not something to be casual about.
        self.stream = None;
        if let Ok(receiver) = self.receiver.lock() {
            let _ = receiver.try_iter().count();
        }
    }

    fn wake_word_active(&self) -> bool {
        false
    }
}
