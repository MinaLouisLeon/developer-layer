//! The "Atlas" wake word, through Picovoice's Porcupine.
//!
//! This is our own binding rather than Picovoice's, and the reason is
//! mechanical rather than a preference. Their Rust binding is not on crates.io,
//! and as a git dependency it does not build: its `build.rs` copies a `data/`
//! directory that only exists after the `copy.sh` in their publish pipeline has
//! run, so a plain checkout panics before it compiles a line.
//!
//! Binding the C API directly is about a hundred and fifty lines, because the
//! surface is six functions. It also removes the build-time dependency
//! entirely — `libpv_porcupine` is loaded at runtime, exactly as their own
//! binding does — which means nothing of Picovoice's is committed here and
//! nothing about the licence of their binaries touches this repository. The
//! user's copy is fetched into their config directory, and this loads it from
//! wherever it is.
//!
//! What still cannot be automated is the keyword. Only a handful of words ship
//! built in and "Atlas" is not among them, so the `.ppn` is trained on
//! Picovoice's console and supplied by the user.

use std::ffi::{c_char, c_float, c_int, CStr, CString};
use std::path::Path;

use libloading::{Library, Symbol};

use crate::audio;
use crate::{Result, VoiceError};

/// Opaque handle owned by the library.
#[repr(C)]
struct CPorcupine {
    _private: [u8; 0],
}

type InitFn = unsafe extern "C" fn(
    access_key: *const c_char,
    model_path: *const c_char,
    num_keywords: i32,
    keyword_paths: *const *const c_char,
    sensitivities: *const c_float,
    object: *mut *mut CPorcupine,
) -> c_int;
type DeleteFn = unsafe extern "C" fn(object: *mut CPorcupine);
type ProcessFn = unsafe extern "C" fn(
    object: *mut CPorcupine,
    pcm: *const i16,
    keyword_index: *mut i32,
) -> c_int;
type FrameLengthFn = unsafe extern "C" fn() -> i32;
type SampleRateFn = unsafe extern "C" fn() -> i32;
type VersionFn = unsafe extern "C" fn() -> *mut c_char;

/// `PV_STATUS_SUCCESS`. Every other value is a failure, and the ones worth
/// telling apart are the activation errors — those mean the access key is the
/// problem, not the audio.
const PV_SUCCESS: c_int = 0;

fn describe(status: c_int) -> &'static str {
    match status {
        1 => "the library ran out of memory",
        2 => "an input/output error",
        3 => "an argument was invalid — usually a keyword file that is not a .ppn",
        4 => "the library's internal state is invalid",
        5 => "the key does not cover this platform",
        6 => "the runtime is not supported here",
        7 => "the library failed at runtime",
        8 => "the Picovoice access key was rejected",
        9 => "the Picovoice access key has reached its activation limit",
        10 => "the Picovoice access key is being throttled",
        11 => "the Picovoice access key was refused",
        _ => "an unrecognised failure",
    }
}

/// Wake-word detection over a stream of 16 kHz mono frames.
///
/// Field order is load-bearing: Rust drops fields in declaration order, so the
/// handle is deleted and the function pointers go out of use *before* the
/// library that owns them is unloaded. Reversing this would call into unmapped
/// memory on shutdown.
pub struct PorcupineEars {
    handle: Handle,
    process: ProcessFn,
    delete: DeleteFn,
    /// Dropped last. Nothing above may outlive it.
    _library: Library,
    /// Porcupine reads exactly `frame_length` samples per call and rejects
    /// anything else, while a driver delivers whatever size it likes. This
    /// holds the remainder between calls.
    pending: Vec<i16>,
    frame_length: usize,
}

/// The library's handle, kept apart so it is `Send`.
///
/// A raw pointer is not `Send` by default, but this one is only ever touched
/// from the voice thread that made it — it is moved there once at construction
/// and never shared.
struct Handle(*mut CPorcupine);

// SAFETY: the pointer is created and used on exactly one thread. `PorcupineEars`
// exposes no way to obtain it, and the only methods that dereference it take
// `&mut self`, so no two threads can be inside the library at once.
unsafe impl Send for Handle {}

/// Where Porcupine's own files live: the shared library and its parameters.
///
/// A directory rather than two paths, because they are fetched together and a
/// user who has one always has the other.
#[derive(Debug, Clone)]
pub struct Runtime {
    pub directory: std::path::PathBuf,
}

impl Runtime {
    /// The shared library, named as each platform names it.
    pub fn library(&self) -> std::path::PathBuf {
        self.directory.join(if cfg!(windows) {
            "libpv_porcupine.dll"
        } else if cfg!(target_os = "macos") {
            "libpv_porcupine.dylib"
        } else {
            "libpv_porcupine.so"
        })
    }

    /// The model every keyword is decoded against. Not the keyword itself.
    pub fn parameters(&self) -> std::path::PathBuf {
        self.directory.join("porcupine_params.pv")
    }

    /// Whether both are present.
    pub fn is_installed(&self) -> bool {
        self.library().is_file() && self.parameters().is_file()
    }
}

impl PorcupineEars {
    /// Load the library and build a detector for one keyword.
    pub fn new(runtime: &Runtime, access_key: &str, keyword: &Path) -> Result<Self> {
        for (path, what) in [
            (runtime.library(), "Porcupine's library"),
            (runtime.parameters(), "Porcupine's parameters"),
            (keyword.to_path_buf(), "the wake word file"),
        ] {
            if !path.is_file() {
                return Err(VoiceError::MissingAsset(format!(
                    "{what}, at {}",
                    path.display()
                )));
            }
        }

        // SAFETY: loading a shared library runs its initialisers, which is
        // unsound if the file is not the library it claims to be. The path
        // comes from our own config directory, and the symbol lookups below
        // fail cleanly if it is something else.
        let library = unsafe { Library::new(runtime.library()) }
            .map_err(|e| VoiceError::Wake(format!("could not load Porcupine: {e}")))?;

        // Looked up once. Doing it per frame would be a dynamic symbol
        // resolution sixty times a second for the life of the process.
        // SAFETY: each name is a documented export of this library, and the
        // signatures match Picovoice's published C header.
        let (init, delete, process, frame_length, sample_rate, version) = unsafe {
            (
                *symbol::<InitFn>(&library, b"pv_porcupine_init\0")?,
                *symbol::<DeleteFn>(&library, b"pv_porcupine_delete\0")?,
                *symbol::<ProcessFn>(&library, b"pv_porcupine_process\0")?,
                *symbol::<FrameLengthFn>(&library, b"pv_porcupine_frame_length\0")?,
                *symbol::<SampleRateFn>(&library, b"pv_sample_rate\0")?,
                *symbol::<VersionFn>(&library, b"pv_porcupine_version\0")?,
            )
        };

        // SAFETY: no arguments, no state, and the returned pointer is a static
        // string owned by the library.
        let (rate, frame, version) = unsafe {
            (
                sample_rate(),
                frame_length(),
                CStr::from_ptr(version()).to_string_lossy().into_owned(),
            )
        };

        // The rate everything upstream resamples to. Asserted rather than
        // assumed: a future Porcupine that wanted 8 or 32 kHz would otherwise
        // be fed the wrong audio and simply never detect anything.
        if rate != audio::TARGET_RATE as i32 {
            return Err(VoiceError::Wake(format!(
                "Porcupine {version} wants {rate} Hz audio; this build resamples to {}",
                audio::TARGET_RATE
            )));
        }

        let key = cstring(access_key, "the Picovoice access key")?;
        let model = path_cstring(&runtime.parameters())?;
        let keyword_path = path_cstring(keyword)?;
        let keywords = [keyword_path.as_ptr()];
        // Slightly under Picovoice's default of 0.5. A wake word is a doorbell,
        // not a command: a miss costs one repeated phrase, while a false
        // trigger opens the microphone in the middle of a meeting. The session
        // gives up quietly a few seconds later either way.
        let sensitivities = [0.4f32];

        let mut handle: *mut CPorcupine = std::ptr::null_mut();
        // SAFETY: every pointer is to a live local that outlives the call, the
        // keyword count matches the two arrays, and `handle` is written only
        // on success.
        let status = unsafe {
            init(
                key.as_ptr(),
                model.as_ptr(),
                1,
                keywords.as_ptr(),
                sensitivities.as_ptr(),
                &mut handle,
            )
        };

        if status != PV_SUCCESS || handle.is_null() {
            return Err(VoiceError::Wake(format!(
                "Porcupine did not start: {}",
                describe(status)
            )));
        }

        tracing::info!(%version, frame_length = frame, "wake word engine ready");

        Ok(Self {
            handle: Handle(handle),
            process,
            delete,
            _library: library,
            pending: Vec::with_capacity(frame as usize * 2),
            frame_length: frame.max(1) as usize,
        })
    }

    /// Feed mono 16 kHz audio; true when the wake word was heard.
    ///
    /// Buffers across calls so a driver's frame size need not match
    /// Porcupine's. Without that, a device delivering 480-sample frames against
    /// a 512-sample requirement would never detect anything at all — and would
    /// do it silently.
    pub fn accepts(&mut self, samples: &[f32]) -> Result<bool> {
        self.pending.extend_from_slice(&audio::to_i16(samples));

        let mut woken = false;
        while self.pending.len() >= self.frame_length {
            let mut index: i32 = -1;
            // SAFETY: the handle is non-null for this type's whole life, and
            // the slice is exactly `frame_length` samples, which is what the
            // library reads.
            let status = unsafe {
                (self.process)(
                    self.handle.0,
                    self.pending[..self.frame_length].as_ptr(),
                    &mut index,
                )
            };
            self.pending.drain(..self.frame_length);

            if status != PV_SUCCESS {
                return Err(VoiceError::Wake(describe(status).into()));
            }
            if index >= 0 {
                woken = true;
            }
        }
        Ok(woken)
    }

    /// Forget buffered audio, so the tail of one utterance cannot trigger the
    /// next.
    pub fn reset(&mut self) {
        self.pending.clear();
    }
}

impl Drop for PorcupineEars {
    fn drop(&mut self) {
        if !self.handle.0.is_null() {
            // SAFETY: the handle came from `pv_porcupine_init`, has not been
            // deleted, and the library is still loaded — it is the last field
            // to drop.
            unsafe { (self.delete)(self.handle.0) };
            self.handle.0 = std::ptr::null_mut();
        }
    }
}

/// Look up one symbol, naming it if it is absent.
///
/// # Safety
/// The caller asserts that `T` matches the symbol's real signature.
unsafe fn symbol<'a, T>(library: &'a Library, name: &[u8]) -> Result<Symbol<'a, T>> {
    library.get(name).map_err(|_| {
        VoiceError::Wake(format!(
            "{} is not a Porcupine library: it has no {}",
            "that file",
            String::from_utf8_lossy(&name[..name.len() - 1])
        ))
    })
}

fn cstring(value: &str, what: &str) -> Result<CString> {
    CString::new(value).map_err(|_| VoiceError::Wake(format!("{what} contains a null byte")))
}

/// A path as the C API wants it.
///
/// A path that is not UTF-8 cannot be passed at all, which is worth saying
/// plainly rather than letting the library fail on a truncated string.
fn path_cstring(path: &Path) -> Result<CString> {
    let text = path.to_str().ok_or_else(|| {
        VoiceError::MissingAsset(format!(
            "{} is not a path Porcupine can be given",
            path.display()
        ))
    })?;
    cstring(text, "a path")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_runtime_names_the_library_this_platform_actually_uses() {
        let runtime = Runtime {
            directory: std::path::PathBuf::from("/pv"),
        };
        let name = runtime.library();
        let name = name.file_name().expect("a file name");

        #[cfg(windows)]
        assert_eq!(name, "libpv_porcupine.dll");
        #[cfg(not(windows))]
        assert!(name.to_string_lossy().starts_with("libpv_porcupine."));

        assert!(runtime.parameters().ends_with("porcupine_params.pv"));
    }

    #[test]
    fn an_empty_directory_is_not_an_installation() {
        let dir = tempfile::tempdir().expect("temp dir");
        let runtime = Runtime {
            directory: dir.path().to_path_buf(),
        };
        assert!(!runtime.is_installed());
    }

    #[test]
    fn both_files_are_required_not_just_the_library() {
        // A half-finished download leaves one of them behind, and Porcupine
        // fails deep inside `init` rather than at a path that can be named.
        let dir = tempfile::tempdir().expect("temp dir");
        let runtime = Runtime {
            directory: dir.path().to_path_buf(),
        };
        std::fs::write(runtime.library(), b"not really a library").expect("write");
        assert!(!runtime.is_installed());

        std::fs::write(runtime.parameters(), b"params").expect("write");
        assert!(runtime.is_installed());
    }

    #[test]
    fn every_documented_status_says_something_different() {
        // "Porcupine did not start (8)" sends the user to a search engine; "the
        // access key was rejected" sends them to their console.
        let mut seen = std::collections::HashSet::new();
        for status in 1..=11 {
            assert!(seen.insert(describe(status)), "duplicate for {status}");
        }
        assert!(describe(8).contains("access key"));
    }
}
