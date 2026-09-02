# Developer Layer 0.8.0-beta.1

A Windows 11 shell replacement built around a strict no-overlap grid. This is
the first build you can install rather than compile.

**It is a beta in the honest sense.** Every rule in it is unit-tested and the
whole workspace compiles and lints for Windows on every push, but *none of it
has run on real hardware yet* — not the tiling, not the taskbar replacement,
not the microphone. You are the first person to run it. Read "If something
goes wrong" before turning anything on.

## Installing

Run the attached `-setup.exe`. Tagged releases also carry an `.msi`, which is
the quieter of the two if you would rather it did not ask anything; beta builds
are `.exe` only.

**Windows will warn you.** The installer is not code-signed — a certificate
costs a few hundred pounds a year and this is a personal project — so
SmartScreen shows "Windows protected your PC". *More info → Run anyway*. That
warning is about the absence of a signature, not about anything found in the
file. If you would rather not, build from source: `npm ci && npm run
desktop:build`.

WebView2 is downloaded by the installer if the machine does not already have
it. Windows 11 always does.

## What it does

- **A strict no-overlap grid.** Windows tile into slots; each application gets
  the same slot every time. No maximise, no fullscreen. Minimise is fine.
- **Layouts per display set**, edited by dragging borders on a scale model of
  your actual displays. Unplug a display and its windows minimise to the dock
  rather than being force-placed; plug it back in and exactly those return.
- **A dock** that replaces the taskbar, with running state, thumbnails, and
  click semantics decided in Rust rather than guessed at in the UI.
- **A telemetry tile** — CPU, memory, disk, network, and per-adapter GPU.
  Anything unmeasurable reads as a dash rather than as zero.
- **mino-workbench**, embedded as a tiled window sharing the same process.
  Its file tree has extract and compress through WinRAR's console tools; no
  WinRAR window ever opens.
- **Atlas**, a command bar on `Alt+Space` over a typed action registry, and
  voice on `Ctrl+Alt+A` once a speech model is downloaded from the settings
  screen.

## First run

Everything destructive is **off**, and stays off until you say otherwise:

| Setting | Default | Why |
| --- | --- | --- |
| Replace the Windows taskbar | off | The most destructive thing here. Turn it on once the rest has behaved. |
| Start at logon, elevated | off | Nothing should launch itself elevated at logon on a machine where it has never run. |
| Voice | off | Needs a speech model you choose and download first. |

Elevation is worth understanding: without it the grid **silently skips** every
window owned by an elevated process. Nothing breaks, some windows just do not
move. "Start at logon, elevated" is the fix, and it is the reason that setting
exists.

## If something goes wrong

The taskbar replacement is the one thing that can leave you stuck, so it has
four independent ways back:

1. Turn the setting off.
2. **`Ctrl+Alt+Shift+T`** — restores the taskbar at any time, from anywhere.
3. A crash restores it: there is a panic hook and an unhandled-exception
   filter.
4. A **guardian process** restores it even if Developer Layer is killed
   outright. It is a separate process precisely so that `TerminateProcess`
   cannot take it with the main one.

If all four somehow fail: `Ctrl+Shift+Esc` → File → Run new task →
`explorer.exe`.

Config lives in `%APPDATA%\developer-layer\`. Deleting `config.toml` resets
every layout; the app refuses to start on a corrupt one rather than quietly
discarding your arrangements.

## Not in this build

- **The LM Studio agent** (phase 09) and **title-bar theming plus macOS**
  (phase 10).
- **The "Atlas" wake word** needs three things: download Porcupine's runtime
  from the settings screen, get a free access key from
  [Picovoice](https://console.picovoice.ai), and train an "Atlas" keyword
  there. Only a handful of words ship built in and ours is not among them, so
  that last step cannot be automated. Push-to-talk needs none of it.
- **Code signing.** See above.
- **A settings screen for everything.** `config.toml` is hand-editable and
  meant to be; the settings section covers the switches that matter.

## Reporting something

Please say what you were doing, what happened, and what
`%APPDATA%\developer-layer\config.toml` contains. Run with
`RUST_LOG=dl_desktop=debug,dl_wm=debug` from a terminal to get a log worth
attaching.
