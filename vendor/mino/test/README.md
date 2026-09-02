# Test layout

This folder is the authoritative location for every TypeScript test in the
repo. Nothing lives next to source under `apps/ui/src`.

```
test/
  README.md              this file
  setup.ts               vitest setup: jest-dom, ResizeObserver, rAF
  <module>/
    fake-transport.ts    shared fixtures for the module (not a test file)
    fake-git.ts          the fake git surface (not a test file)
    fake-git-history.ts  the fake diff/log/blame surface (not a test file)
    fake-git-refs.ts     the fake branch/stash surface (not a test file)
    fake-git-remote.ts   the fake remote/conflict surface, and its record
    fake-git-rows.ts     the git rows and constants tests are written against
    fake-git-remote-rows.ts  the remote and conflict rows
    fake-options.ts      everything a test can configure, in one interface
    fake-github.ts       the fake GitHub surface, and its request log (not a test file)
    fake-github-rows.ts  the GitHub rows and probes tests are written against
    harness.tsx          render helpers (not a test file)
    unit/*.test.ts       pure logic, hooks, transforms
    integration/*.test.tsx  component render tests
    e2e/*.spec.ts        Playwright, one spec per flow
    e2e/fixtures.ts      Playwright fixtures
```

## Rules

- **Vitest owns `*.test.ts` / `*.test.tsx`. Playwright owns `*.spec.ts`.**
  Never mix the extensions; `vitest.config.ts` excludes `e2e/`, and
  `playwright.config.ts` matches `**/e2e/*.spec.ts` only.
- **Vitest globals are off.** Import `describe`, `it`, `expect` and `vi` from
  `"vitest"` explicitly in every file.
- `unit/api-routes/*.test.ts` (with `// @vitest-environment node` on line 1) is
  reserved for HTTP route handlers. **This repo has none** - the transport is
  the API and the daemon's routes are Rust - so the folder is absent by design.
- Extend `test/setup.ts`, `vitest.config.ts` and `playwright.config.ts`; do not
  re-create them. Add each new module's `src` paths to `coverage.include`.

## Modules

| Module | Folder | Covers |
| --- | --- | --- |
| `mino-workbench` | `test/mino-workbench/` | transport client contract, tree lazy-load, viewer guards, `nu`-missing fallback, git badges and the no-git degrade, staging and the discard confirmation, diff mode and the blame gutter, branches and the stash, the GitHub view - checks, lists, the create confirmation and the four ways GitHub can be absent - and phase 6: fetch and pull, the two push confirmations, conflicts, and review threads including the outdated ones |

## The transport is the test seam

Every test mocks the transport by supplying a fake `TransportClient` - see
`mino-workbench/fake-transport.ts`. Nothing stubs `fetch`, `invoke` or the
filesystem. If a test cannot be written against the fake, the abstraction has
leaked and the fix belongs in the source, not in the test.

The fake's git surface defaults to **not a repository**, which is deliberate:
that is the shape every pane has to survive unchanged, so an existing test goes
on asserting the no-git rendering without having to say so. A test that wants
git passes `repository` (and optionally `status`) to `createFakeTransport`.

Its GitHub surface defaults the same way - **not a GitHub repository** - for
the same reason, and a test that wants one passes `probe: READY_PROBE`.

Both mutating surfaces **record what they were asked for**: `githubRequests`
and `countGitHub` for GitHub, and `pushes`, `pulls` and `resolutions` for the
remote. That is half of what phases 5 and 6 assert, because the bugs that
matter most there are invisible to a rendering assertion - a section that
fetched while collapsed, and a push that reached the transport without being
confirmed. `pushes` is appended to *before* any configured failure fires, so a
test can tell "the push was rejected" from "the push never happened".

## Rust tests

Rust unit and integration tests live beside their crate per Cargo convention
(`crates/mino-core/tests/`, `#[cfg(test)]` modules). The rule above governs the
TypeScript side only.
