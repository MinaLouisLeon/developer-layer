# Changelog

## 0.8.0-beta.1

The first installable build. See [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md)
for what to expect and how to get out of trouble.

### Added

- **Slot engine.** Strict no-overlap tiling with assigned per-application
  slots, stored as fractions of the work area so a resolution change
  re-projects rather than invalidates. Invisible-border compensation, reactive
  maximise suppression, and a reconcile pass that does no work on a settled
  workspace.
- **Layouts per display set**, with a designated default as fallback and an
  edit mode that drags borders on a scale model of the connected displays.
  Disconnect minimises orphaned windows to the dock and reconnect restores
  exactly those.
- **Dock** replacing the taskbar: running state, focus and minimise,
  `PrintWindow` thumbnails, AppBar space reservation.
- **Taskbar replacement** with four independent restore routes, including a
  guardian process that survives `TerminateProcess`.
- **Telemetry tile** — CPU, memory, disk, network and per-adapter GPU through
  sysinfo, DXGI, PDH and NVML. Unmeasurable metrics are absent, never zero.
- **mino-workbench**, vendored and embedded as a tiled window sharing one
  `mino-core`, with extract and compress in its file tree through WinRAR's
  console tools.
- **Atlas command bar** on a global hotkey, over a typed action registry with
  fuzzy search, recency and a total ordering.
- **Atlas voice** — push-to-talk, Whisper transcription loaded on demand and
  dropped when idle, and an optional Porcupine wake word. Refuses to act on a
  phrase it is not confident about.
- **Start at logon**, elevated, through a Task Scheduler entry.
- **Release workflow** producing MSI and NSIS installers.

### Notes

- Nothing here has run on real hardware. Every rule is unit-tested and the
  workspace compiles and lints for Windows on every push, which is not the
  same thing.
- `startAtLogon` now defaults to **off**. It had defaulted to on while being
  implemented nowhere.
