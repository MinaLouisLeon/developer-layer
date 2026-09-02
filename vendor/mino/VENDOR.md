# Vendored: mino-workbench

Upstream: <https://github.com/MinaLouisLeon/mino-workbench>
Commit:   `63620e4004e19b3137c12026b97eec051a070f15`
Licence:  MIT — see [LICENSE](LICENSE), Copyright (c) 2026 Mina Louis.

Developer Layer is MIT, so mino's MIT terms carry over unchanged. Upstream's
copyright notice is preserved verbatim beside this file and must stay there.

## What is here

| Path | Upstream path | Local changes |
| --- | --- | --- |
| `crates/mino-core/` | `crates/mino-core/` | **none** — byte-identical |
| `ui/src/` | `apps/ui/src/` | see **Patches** |
| `ui/tailwind.config.ts` | `apps/ui/tailwind.config.ts` | none (theme source; the host owns `content`) |
| `desktop/` | `apps/desktop/src-tauri/src/{state.rs,commands/}` | see **Patches** |
| `test/` | `test/` | see **Patches** |
| `vitest.config.ts` | `vitest.config.ts` | paths point at `vendor/mino/ui` |

`mino-agent` is not vendored: it serves the browser build, which Developer
Layer does not have. Neither are upstream's `index.html`, `main.tsx`'s page
scaffolding, `vite.config.ts`, `postcss.config.js` or its Playwright specs —
the host owns the build (`apps/ui/shell/mino.html`, `vite.config.ts`,
`tailwind.config.ts`, `postcss.config.js`) and drives a real window itself.

## How the workbench is embedded

As a **second window**, not a component. `apps/ui/shell/mino.html` is the
second entry in the host's Vite build and loads upstream's own `main.tsx`
untouched, so the workbench keeps its own document, its own Tailwind preflight
and its own root — and the slot engine tiles it like any other application,
which is what the locked window model says should happen to it.

The forty Tauri commands keep **upstream's names**, unprefixed. That is what
lets 274 UI source files come across without a transport patch: the names are
written down in `ui/src/Types/modules/api.ts`. None collides with one of
Developer Layer's own, and a future collision would be a `generate_handler!`
compile error rather than a silent misroute.

## Why the core is shared rather than forked

The locked decision is *"vendored into this monorepo, sharing the Rust core
directly"*. `crates/mino-core/Cargo.toml` is therefore **byte-identical to
upstream**: every dependency it names is `.workspace = true`, and the root
`Cargo.toml` supplies each one at the version upstream pins. That is what makes
a resync a copy rather than a merge.

Two consequences follow, both intentional:

- `version.workspace = true` gives the vendored crate Developer Layer's version
  rather than mino's. The commit hash above is the real provenance marker.
- Upstream's `rust-version` floor of 1.85 propagates to this whole workspace.
  `russh` pulls a transitive `zeroize` published as edition 2024, which will
  not parse below it.

## How it is checked

The vendored crate is a workspace member but **not** a default member, so
`cargo test` runs Developer Layer's own suites. It is still fully type-checked
and clippy-linted, on both Linux and the windows-gnu target, by the workspace
passes in `.github/workflows/ci.yml`. That is what catches a bad resync.

To run upstream's suite deliberately: `cargo test -p mino-core`.

## Patches

Every deviation from upstream is listed here. Keep this table honest — it is
the whole cost of the next resync.

### Dependency versions

Upstream pins every version exactly, because there it is the whole
application. Here it is half of one, and the packages that must be a **single
instance in a single bundle** have to track the host instead. `ui/package.json`
therefore widens `react`, `react-dom`, `@tauri-apps/api`,
`@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-opener` to `^`, and the
root `package.json` carries an `overrides` block holding `react` and
`react-dom` at one version — two workspaces both asking for `^19.0.0` resolved
to 19.2.8 and 19.0.0, which react-dom refuses outright at import. **Bump those
two together.**

### Files

| File | Change | Why |
| --- | --- | --- |
| `ui/package.json` | Rewritten: a library rather than an app, dependency ranges widened, a `test` script added | It has no build of its own here — see above |
| `desktop/commands/*.rs` | `use crate::state::AppState` → `use crate::mino::state::AppState`, one line in each of ten files | The module sits under `mino` inside the host's crate |
| `ui/src/features/file-tree/archive/` | **Added** — five files: the menu, its status line, the hook and the host commands | The archive actions. See below |
| `ui/src/features/file-tree/types.ts` | `TreeRowContextValue` gains `onContextMenu`; `FileTreeState` gains `reload` | Threading the menu; `reload` already existed and is only now returned |
| `ui/src/features/file-tree/hooks/useFileTree.ts` | Returns `reload` | Same — one line, no new behaviour |
| `ui/src/features/file-tree/hooks/useFileTreePane.ts` | Holds the open menu and the archive actions | Same |
| `ui/src/features/file-tree/components/TreeRow.tsx` | `onContextMenu` on the row | Right-click opens the menu |
| `ui/src/features/file-tree/components/TreeRows.tsx` | Passes it through | Same |
| `ui/src/features/file-tree/components/FileTreePane.tsx` | Renders the menu and its status | Same |
| `test/mino-workbench/integration/archive-menu.test.tsx` | **Added** | Developer Layer's tests for the above |
| `test/mino-workbench/integration/github-create-pr.test.tsx` | One `expect` wrapped in `waitFor` | The dialog opens before the checked-out branch arrives and renders "this branch" until it does. Upstream's pinned tree won that race; ours does not. The behaviour is right either way, and the assertions around it already wait |
| `test/timeouts.ts` | **Added**, loaded after upstream's `setup.ts` | Testing Library gives every `findBy*` one second. That is ample locally and too tight on a CI runner already running forty-nine files in parallel — the suite went green here three times and then failed once on GitHub, on a correct assertion that had simply not happened yet. Raising the ceiling weakens nothing: a `findBy*` returns the moment its element appears |

### The archive actions

The locked decision is *"WinRAR: no GUI. Archive actions in mino's file tree
via `rar.exe`."* The tree had no context menu, so one was added rather than an
existing seam reused — there was none. Everything below `invoke` is Rust, in
`crates/dl-archive`, which is where the switches, the exit codes and where the
archive lands are tested. What is patched in here is only what the browser can
get wrong: what the menu offers, and what the user is told afterwards.

## Resyncing

```bash
git clone https://github.com/MinaLouisLeon/mino-workbench /tmp/mino
rm -rf vendor/mino/crates/mino-core && cp -r /tmp/mino/crates/mino-core vendor/mino/crates/
rm -rf vendor/mino/ui && cp -r /tmp/mino/apps/ui vendor/mino/ui
cp /tmp/mino/LICENSE vendor/mino/LICENSE
```

(`desktop/` and `test/` come from `apps/desktop/src-tauri/src` and `test/`
respectively; drop `test/mino-workbench/e2e`, which drives a real window.)

Then reapply every row of **Patches**, update the commit hash above, reconcile
any dependency upstream added into the root `Cargo.toml`, and run:

```bash
cargo clippy --target x86_64-pc-windows-gnu --workspace --all-targets -- -D warnings
cargo test -p mino-core
TS_RS_EXPORT_DIR=$PWD/vendor/mino/ui/src/Types cargo test -p mino-core export_bindings
npm run typecheck && npm run test:ui && npm run build
```

`npm run test:ui` is the one that matters most: it is upstream's own suite run
against the patched copy, and `file-tree-pane.test.tsx` plus
`use-file-tree.test.ts` cover every file the archive menu touches.
