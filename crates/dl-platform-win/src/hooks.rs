//! WinEvent hooks.
//!
//! `SetWinEventHook` must be installed on a thread that runs a message pump, so
//! this owns a dedicated thread rather than borrowing the Tauri one. Events are
//! forwarded to a channel; deciding *when* to act on them is
//! `dl_wm::coalesce`'s job, which keeps the timing policy testable.
//!
//! Out-of-context hooks (`WINEVENT_OUTOFCONTEXT`) are deliberate: the in-context
//! variant injects a DLL into every observed process, which is exactly the
//! antivirus profile this project avoids.

use std::sync::mpsc::Sender;
use std::sync::OnceLock;

use dl_core::WindowId;
use dl_wm::coalesce::WindowEvent;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, GetMessageW, PostQuitMessage, TranslateMessage, EVENT_OBJECT_CREATE,
    EVENT_OBJECT_DESTROY, EVENT_OBJECT_HIDE, EVENT_OBJECT_LOCATIONCHANGE, EVENT_OBJECT_SHOW,
    EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_MINIMIZEEND, EVENT_SYSTEM_MINIMIZESTART, MSG,
    OBJID_WINDOW, WINEVENT_OUTOFCONTEXT, WINEVENT_SKIPOWNPROCESS,
};

/// One observed change, before any debouncing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HookEvent {
    pub window: WindowId,
    pub kind: WindowEvent,
}

/// The callback runs on the hook thread and cannot take parameters, so the
/// sender has to be reachable statically. Set once before the hook is
/// installed and never replaced.
static SENDER: OnceLock<Sender<HookEvent>> = OnceLock::new();

/// Install hooks and pump messages until the thread is asked to stop.
///
/// Blocks, so callers should give it its own thread. Returns when the message
/// loop ends.
pub fn run_event_loop(tx: Sender<HookEvent>) {
    // A second call would silently observe the first sender, so refuse rather
    // than send events to a channel nobody is reading.
    if SENDER.set(tx).is_err() {
        tracing_warn("event loop already running; ignoring duplicate start");
        return;
    }

    // Two ranges rather than one wide one: hooking everything in between would
    // deliver a large volume of events we would immediately discard.
    let object_hook = unsafe {
        SetWinEventHook(
            EVENT_OBJECT_CREATE,
            EVENT_OBJECT_LOCATIONCHANGE,
            None,
            Some(on_event),
            0,
            0,
            WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
        )
    };

    let system_hook = unsafe {
        SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_MINIMIZEEND,
            None,
            Some(on_event),
            0,
            0,
            WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
        )
    };

    if object_hook.is_invalid() && system_hook.is_invalid() {
        tracing_warn("SetWinEventHook failed; window events will not be observed");
        return;
    }

    pump_messages();

    // SAFETY: both handles came from SetWinEventHook on this thread.
    unsafe {
        if !object_hook.is_invalid() {
            let _ = UnhookWinEvent(object_hook);
        }
        if !system_hook.is_invalid() {
            let _ = UnhookWinEvent(system_hook);
        }
    }
}

/// Ask the hook thread's message loop to exit.
pub fn stop_event_loop() {
    // SAFETY: posts to the calling thread's queue; harmless if none exists.
    unsafe { PostQuitMessage(0) };
}

fn pump_messages() {
    let mut msg = MSG::default();

    // GetMessageW returns 0 on WM_QUIT and -1 on error; both end the loop.
    // SAFETY: msg is a valid local for the duration of each call.
    while unsafe { GetMessageW(&mut msg, None, 0, 0) }.0 > 0 {
        unsafe {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}

unsafe extern "system" fn on_event(
    _hook: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    id_object: i32,
    id_child: i32,
    _thread: u32,
    _time: u32,
) {
    // Only whole windows matter. Without this filter, every caret move, menu
    // item and scrollbar in every application arrives here.
    if id_object != OBJID_WINDOW.0 || id_child != 0 || hwnd.is_invalid() {
        return;
    }

    let kind = match event {
        EVENT_OBJECT_CREATE
        | EVENT_OBJECT_DESTROY
        | EVENT_OBJECT_SHOW
        | EVENT_OBJECT_HIDE
        | EVENT_SYSTEM_MINIMIZESTART
        | EVENT_SYSTEM_MINIMIZEEND => WindowEvent::Structural,
        EVENT_OBJECT_LOCATIONCHANGE => WindowEvent::Geometry,
        EVENT_SYSTEM_FOREGROUND => WindowEvent::Focus,
        _ => return,
    };

    if let Some(tx) = SENDER.get() {
        // A full or disconnected channel must not stall the hook: blocking here
        // would block the thread the whole desktop's events flow through.
        let _ = tx.send(HookEvent {
            window: WindowId(hwnd.0 as u64),
            kind,
        });
    }
}

fn tracing_warn(message: &str) {
    // The platform crate deliberately has no logging dependency, so failures
    // that a user might need to diagnose go to stderr.
    eprintln!("dl-platform-win: {message}");
}
