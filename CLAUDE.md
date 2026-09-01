# Developer Layer — working notes

Decisions below are **settled**. Do not relitigate them; if one needs to change,
raise it explicitly rather than quietly building something else.

## Locked decisions

| Area | Decision |
| --- | --- |
| Window model | Strict no-overlap grid. No maximise, no fullscreen by default. Minimise permitted. Tiles resizable on both axes. |
| Placement | Assigned slots per application — the same app opens in the same place every time. |
| Telemetry panel | Singleton tile treated as an always-running app. Cannot be closed or opened twice. Bound to one nominated monitor; **migrates** rather than minimising when that display disconnects. |
| Layout editing | Direct manipulation via edit mode on the live workspace. No diagram editor — so layouts can only be edited for currently connected displays. |
| Display changes | Layouts saved per display set, with a designated default as fallback. Orphaned windows **minimise to the dock**, never force-placed. All disconnect-minimised windows restore on reconnect. |
| Dock | Full taskbar replacement — running state, focus and minimise, thumbnails. |
| mino-workbench | Vendored into this monorepo, sharing the Rust core directly. |
| WinRAR | No GUI. Archive actions in mino's file tree via `rar.exe`. |
| Elevation | Auto-elevate at logon via Task Scheduler. |
| Licence | MIT. **No seelen-ui code, ever** — it is AGPL-3.0 and would relicense this project. |
| Assistant | Atlas. Visual identity, text command bar, voice. LM Studio agent later. |
| Hardware | Ryzen + NVIDIA today; Intel iGPU and desktop NVIDIA also supported. |

## Invariants

- **Only `dl-platform-win` may touch an `HWND`.** Everything above it works on
  plain rectangles. This is what keeps `dl-wm` testable on Linux and makes the
  macOS port an implementation rather than a rewrite.
- **Rust owns every domain type.** `apps/ui/shared/src/generated/` is generated
  by `ts-rs` — never hand-edit it. Run `npm run gen:types` after changing
  `dl-core`, and commit the result; CI fails on stale bindings.
- **`apps/desktop` is excluded from default workspace members** because Tauri
  needs webkit2gtk on Linux. Use `cargo test` locally, `--workspace` on Windows.
- **`MinimizeReason` must be set correctly at every minimise site.** The
  reconnect rule depends on distinguishing a user minimise from a
  disconnect orphan; guessing after the fact is impossible.

## Known Win32 traps

These are documented because each one silently produces a broken-looking result
rather than an error:

- `GetWindowRect` includes an invisible ~7px resize border on Windows 10 and 11.
  Tiling to raw values gives uneven gaps and apparently overlapping windows.
  Compare against `DWMWA_EXTENDED_FRAME_BOUNDS` and compensate per window.
- Window enumeration **must** filter on `DWMWA_CLOAKED`. Windows 11 keeps cloaked
  ghost windows for suspended UWP apps; including them fills the dock with
  phantoms.
- `\\.\DISPLAY1` is not stable across reboots or replugs. Monitor identity comes
  from `QueryDisplayConfig` → `DISPLAYCONFIG_TARGET_DEVICE_NAME.monitorDevicePath`.
- MSIX apps (WhatsApp) have no executable path. They launch only via
  `shell:AppsFolder\<AUMID>`.
- Blocking maximise is reactive, not preemptive — preemptive would require DLL
  injection, which this project avoids for antivirus reasons. A single-frame
  flicker when an app maximises itself from saved state is expected.
- Hiding `Shell_TrayWnd` requires a guarantee of restoration: panic hook,
  `SetUnhandledExceptionFilter`, a restore hotkey, and a guardian process. Ship
  these with the hiding, not after. `panic = "abort"` is deliberately not set in
  the release profile for this reason.

## Conventions

- Tests state the rule they protect in the test name, and comment *why* a case
  matters when it is not obvious from the assertion.
- Platform methods that are not yet implemented return
  `PlatformError::Unsupported` naming the phase, rather than panicking or
  silently succeeding.
