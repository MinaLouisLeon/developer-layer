# Vendored: mino-workbench

Upstream: <https://github.com/MinaLouisLeon/mino-workbench>
Commit:   `63620e4004e19b3137c12026b97eec051a070f15`
Licence:  MIT — see [LICENSE](LICENSE), Copyright (c) 2026 Mina Louis.

Developer Layer is MIT, so mino's MIT terms carry over unchanged. Upstream's
copyright notice is preserved verbatim beside this file and must stay there.

## What is here

| Path | Upstream path | Local changes |
| --- | --- | --- |
| `crates/mino-core/` | `crates/mino-core/` | none |
| `ui/` | `apps/ui/` | see **Patches** |

`mino-agent` and mino's own `apps/desktop` are deliberately **not** vendored.
The agent daemon serves the browser build, which Developer Layer does not
have; mino's Tauri app is replaced by ours, which registers the same commands.

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

| File | Change | Why |
| --- | --- | --- |
| _(none yet)_ | | |

## Resyncing

```bash
git clone https://github.com/MinaLouisLeon/mino-workbench /tmp/mino
rm -rf vendor/mino/crates/mino-core && cp -r /tmp/mino/crates/mino-core vendor/mino/crates/
rm -rf vendor/mino/ui && cp -r /tmp/mino/apps/ui vendor/mino/ui
cp /tmp/mino/LICENSE vendor/mino/LICENSE
```

Then reapply every row of **Patches**, update the commit hash above, reconcile
any dependency upstream added into the root `Cargo.toml`, and run:

```bash
cargo clippy --target x86_64-pc-windows-gnu --workspace --all-targets -- -D warnings
cargo test -p mino-core
npm run typecheck && npm run build
```
