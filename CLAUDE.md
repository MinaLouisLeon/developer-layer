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
| mino-workbench | Vendored into this monorepo, sharing the Rust core directly. Embedded as a **second window**, not a component, so the slot engine tiles it like any other app. |
| WinRAR | No GUI. Archive actions in mino's file tree via `rar.exe`. RAR only — `UnRAR.exe` reads nothing else. |
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
  Keep it thin: anything not Tauri-specific belongs in `dl-engine`, which builds
  and tests on Linux. In particular `apps/desktop` must never name the `windows`
  crate — reaching for an `HWND` there breaks the platform boundary, and the
  operation belongs on `ShellIntegration` instead.
- **The whole workspace type-checks on Linux for Windows** via
  `cargo clippy --target x86_64-pc-windows-gnu --workspace --all-targets`.
  `cargo check` does not link, and mingw
  (`binutils-mingw-w64-x86-64`, `gcc-mingw-w64-x86-64`) supplies the resource
  compiler `tauri-build` needs, so even `apps/desktop` is covered. Run this
  before every push: without it `apps/desktop` is invisible until a Windows
  runner picks it up, which is how a broken import once reached CI. Runtime
  behaviour still needs real hardware.
- **Never use `Path::file_name` on a Windows path.** It is host-dependent — on
  Linux it does not treat `\` as a separator, so tests would pass while
  production silently failed to match. Use `dl_engine::basename`-style splitting
  on both separators.
- **`MinimizeReason` must be set correctly at every minimise site.** The
  reconnect rule depends on distinguishing a user minimise from a
  disconnect orphan; guessing after the fact is impossible. `Engine` carries
  this map across passes because the platform cannot report it.
- **Every slot edit preserves coverage.** The slots on a display always tile it
  exactly; a gap is dead screen space no window can occupy. `dl-wm::edit` has a
  test that runs a sequence of edits and asserts coverage never drifts — that
  test caught two real bugs and should stay.
- **A slot may only be absorbed by a neighbour sharing its whole edge.** Merely
  overlapping is not enough: the union has to be a rectangle, or the absorber
  grows into a notch and overlaps whatever sits there.
- **Every exported struct sets `#[serde(rename_all = "camelCase")]`.** One that
  did not (`Monitor`) shipped snake_case into TypeScript and only surfaced when
  a component tried to read it.
- **Cache icons on app identity, not executable path.** Slack's path carries
  its version; keying on it orphans the icon every update and leaks a stale
  file per version.
- **An unmeasurable metric is `None`, never `0`.** `0°C` on an integrated GPU
  reads as a measurement; a dash reads as the gap it is. PDH gives utilisation
  and VRAM for every vendor; temperature, power, clocks and fans are NVML-only.
- **`u64` crosses to TypeScript as `bigint`.** ts-rs is conservative because the
  type exceeds JS safe integers, but Tauri's transport is JSON so the runtime
  value is a number. Coerce through `num()` in the UI rather than assuming
  either.

- **Everything vendored is recorded in `vendor/mino/VENDOR.md`.** `mino-core`
  is byte-identical to upstream, which is only possible because the root
  `Cargo.toml` supplies its dependencies; keep it that way, so a resync is a
  copy rather than a merge. Every deviation anywhere under `vendor/` belongs in
  that file's patch table — it is the whole cost of the next resync, and an
  unrecorded one is a change that will be silently reverted.
- **The vendored workbench keeps upstream's Tauri command names, unprefixed.**
  They are written down in its `Types/modules/api.ts`, so leaving them alone is
  what lets 274 UI files come across untouched. A collision with one of ours is
  a `generate_handler!` compile error, not a silent misroute.
- **`@` in `apps/ui/shell/vite.config.ts` is reserved for the vendored UI.**
  Developer Layer's own code uses relative paths and the `@developer-layer/*`
  package names; an `@` import in the shell would silently resolve into
  `vendor/`.
- **React, react-dom and `@tauri-apps/api` must each be a single instance.**
  Upstream pins them exactly and the shell uses ranges, which installs two
  copies; the root `overrides` block holds react and react-dom at one version,
  and they are bumped together. react-dom refuses a mismatched react outright.
- **`npm run test:ui` is upstream's suite against the vendored copy.** It is
  what says a patch or a resync left the workbench working — it covers every
  file the archive menu touches. Run it before every push that changes
  anything under `vendor/`.

- **Every action Atlas can perform is declared once, in `dl-atlas::action`.**
  The command bar reads it now and phase 09's tool-calling reads the same
  declarations; a `match` in the command bar instead would make adding the LLM
  a rewrite. A registry entry with no arm in `plan` is a row the bar shows and
  then refuses to run, which `every_action_in_the_registry_can_be_planned`
  exists to catch.
- **A hotkey with no modifier is refused.** It registers successfully and then
  swallows that key across the whole desktop — bind the bar to `Space` and
  nothing on the machine can type one again. The OS reports no error, so
  `dl-atlas::hotkey` is the only place it can be caught, and a bad accelerator
  is a startup error rather than a hotkey that silently never fires.
- **The command bar window sets `skipTaskbar`**, which is `WS_EX_TOOLWINDOW` on
  Windows, which is what makes the classifier ignore it. Without that the slot
  engine tiles our own overlay into the user's workspace.
- **The UI hands back an invocation key, never a list index.** It is re-parsed
  and re-validated against a fresh snapshot, so a row chosen from a palette
  built a minute ago cannot run whatever has since taken that position, and a
  closed window is refused rather than focused through a recycled handle.
- **Recents live in their own file, not in `config.toml`.** The layout file is
  written when the user arranges something; recents are written on every
  command. A corrupt recents file is ignored, which is the opposite of the rule
  the config lives under — and right, because it holds no work the user did.

- **Voice must always be able to decline.** A keyboard shows a list and waits
  for Enter; a microphone gets one pass at a phrase and then acts. So
  `dl-atlas::voice::resolve` has a score floor (a phrase that was not a command
  is refused), an ambiguity margin (two close readings ask rather than guess),
  and confirmation from the registry's `Risk` regardless of confidence — a
  confident mishearing is still a mishearing.
- **A confirmation that times out means no.** The only action that asks is the
  one that cannot be undone by doing it again, so treating silence as consent
  would be exactly backwards.
- **Downsampling low-passes first.** Everything above the new 8 kHz Nyquist
  folds back into the speech band as tones nobody said. The obvious cheap
  filter is not enough to claim this: from 44.1 kHz the decimation span is
  under three samples, and a three-tap average still passes 9 kHz at 80%.
  `dl-voice::audio` uses a windowed-sinc, and a test asserts the stopband.
- **Typed and spoken commands go through one dispatcher**,
  `apps/desktop::atlas::run_key`. A second path would be a second place for the
  two to disagree about what an invocation key means, and the spoken one is the
  half nobody is watching.
- **There is no wake word engine.** `dl_voice::WAKE_WORD` is `false`;
  push-to-talk is what starts an utterance. Picovoice's Porcupine is not on
  crates.io — the `porcupine` crate there is an unrelated Win32 wrapper — so it
  means a git dependency plus their native library, which is neither MIT nor
  something to bundle without deciding to. The capability model already reports
  it as absent and `Trigger::WakeWord` already exists, so adding one later is
  an implementation rather than a reshaping.

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
  `shell:AppsFolder\<AUMID>`, and their icon comes from the package manifest,
  not a binary's resources. `IShellItemImageFactory` handles both kinds, so
  packaged and unpackaged apps share one extraction path.
- Squirrel apps (Slack, Postman) live in versioned `app-x.y.z` directories that
  change on every update. **Compare those versions numerically** — `app-4.9.0`
  sorts after `app-4.10.0` as a string, pinning the dock to a build Squirrel
  will eventually delete.
- Blocking maximise is reactive, not preemptive — preemptive would require DLL
  injection, which this project avoids for antivirus reasons. A single-frame
  flicker when an app maximises itself from saved state is expected.
- Hiding `Shell_TrayWnd` requires a guarantee of restoration: panic hook,
  `SetUnhandledExceptionFilter`, a restore hotkey, and a guardian process. Ship
  these with the hiding, not after. `panic = "abort"` is deliberately not set in
  the release profile for this reason. **Only the guardian survives
  `TerminateProcess`** — it is a separate process for exactly that reason, and
  it must be running *before* anything hides the taskbar. Also hide
  `Shell_SecondaryTrayWnd`, or every display but the first keeps its taskbar.
- Taskbar state is marked hidden *before* the `ShowWindow` call, not after. If
  the primary hides and the process dies before the secondary, a flag set
  afterwards would claim nothing is hidden and no route would clean up.
- `PrintWindow` needs `PW_RENDERFULLCONTENT`, or every GPU-composited
  application — Chrome, VS Code, most of the dock — captures as a blank
  rectangle. GDI also leaves alpha at zero on opaque windows, which renders the
  whole thumbnail invisible unless it is forced to 255.

## Conventions

- Tests state the rule they protect in the test name, and comment *why* a case
  matters when it is not obvious from the assertion.
- Platform methods that are not yet implemented return
  `PlatformError::Unsupported` naming the phase, rather than panicking or
  silently succeeding.
- Every `unsafe` block carries a `SAFETY:` comment stating why it holds.
- A stage of the engine pipeline that can be pure logic is pure logic. The
  platform layer reports facts and performs actions; it never decides policy.
  Timing policy included — `dl-wm::coalesce` takes an injected clock so the
  debounce rules are tested rather than eyeballed on a running desktop.
- Config is never silently reset. A corrupt file is a startup error, because it
  holds every layout the user arranged.
- Telemetry is pushed, never polled: the backend owns the interval, and history
  lives in the Rust ring buffer so a remounted panel loses nothing.
- A dock click's meaning is decided in Rust, not the UI: it depends on window
  count, which are minimised, and which holds the foreground. Clicking the
  focused window minimises it — re-focusing something already focused looks
  like a dead click.
- Gauges draw to Canvas. CSS filter glow on an always-visible widget
  re-rasterises every frame on every display — the cost a system monitor must
  not impose on the system it measures.
