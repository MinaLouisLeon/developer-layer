//! Transcription through whisper.cpp, loaded on demand.
//!
//! The model is a couple of hundred megabytes resident. Loading it at startup
//! would put that on every session whether or not a word is ever spoken, so it
//! loads on the first utterance and is dropped again once
//! `dl-atlas`'s session says it has been idle long enough.

use std::path::{Path, PathBuf};

use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use crate::{Result, Transcriber, VoiceError};

/// Below this there is no speech worth sending — a stray key press, or a wake
/// word that fired on nothing. Whisper answers a very short clip with
/// hallucinated filler surprisingly often, so this is a correctness guard
/// rather than an optimisation.
const MIN_SAMPLES: usize = crate::audio::TARGET_RATE as usize / 4;

pub struct Whisper {
    model: PathBuf,
    context: Option<WhisperContext>,
}

impl Whisper {
    pub fn new(model: impl Into<PathBuf>) -> Result<Self> {
        let model = model.into();
        if !model.is_file() {
            return Err(VoiceError::MissingAsset(format!(
                "the speech model {}",
                model.display()
            )));
        }
        Ok(Self {
            model,
            context: None,
        })
    }

    fn context(&mut self) -> Result<&WhisperContext> {
        if self.context.is_none() {
            tracing::info!(model = ?self.model, "loading the speech model");
            let context = WhisperContext::new_with_params(
                &path_string(&self.model)?,
                WhisperContextParameters::default(),
            )
            .map_err(|e| VoiceError::Transcribe(e.to_string()))?;
            self.context = Some(context);
        }
        Ok(self.context.as_ref().expect("just loaded"))
    }
}

/// whisper.cpp takes a C string path, so a path that is not UTF-8 cannot be
/// passed at all. Saying so beats a confusing failure inside the library.
fn path_string(path: &Path) -> Result<String> {
    path.to_str().map(str::to_owned).ok_or_else(|| {
        VoiceError::MissingAsset(format!(
            "{} is not a path that can be given to the speech model loader",
            path.display()
        ))
    })
}

impl Transcriber for Whisper {
    fn transcribe(&mut self, samples: &[f32]) -> Result<String> {
        if samples.len() < MIN_SAMPLES {
            return Ok(String::new());
        }

        let context = self.context()?;
        let mut state = context
            .create_state()
            .map_err(|e| VoiceError::Transcribe(e.to_string()))?;

        // Greedy rather than beam search: this is a short command phrase, and
        // the seconds a beam search costs are seconds the user spends watching
        // a spinner for a phrase they could have typed.
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some("en"));
        params.set_translate(false);
        // Every one of these prints to stdout by default, which in a windowed
        // application goes nowhere useful and in a console build interleaves
        // with the log.
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        // Nothing downstream uses timestamps, and not computing them is
        // measurably faster.
        params.set_token_timestamps(false);
        params.set_suppress_blank(true);

        state
            .full(params, samples)
            .map_err(|e| VoiceError::Transcribe(e.to_string()))?;

        let segments = state
            .full_n_segments()
            .map_err(|e| VoiceError::Transcribe(e.to_string()))?;

        let mut text = String::new();
        for i in 0..segments {
            let segment = state
                .full_get_segment_text(i)
                .map_err(|e| VoiceError::Transcribe(e.to_string()))?;
            text.push_str(&segment);
        }

        Ok(text.trim().to_string())
    }

    fn unload(&mut self) {
        if self.context.take().is_some() {
            tracing::info!("dropped the speech model");
        }
    }

    fn is_loaded(&self) -> bool {
        self.context.is_some()
    }
}
