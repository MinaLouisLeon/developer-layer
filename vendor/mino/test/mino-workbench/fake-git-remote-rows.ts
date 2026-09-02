import type { GitConflict, GitConflictKind, GitRemote } from "@/Types";

/**
 * The remote and conflict rows the phase 6 tests are written against.
 *
 * Split from `fake-git-remote.ts` so neither file grows past the project's
 * ceiling - the arrangement `fake-github-rows.ts` already uses.
 */

/** One remote, over HTTPS, with nothing exotic about it. */
export function makeRemote(
  name = "origin",
  overrides: Partial<GitRemote> = {},
): GitRemote {
  return {
    name,
    fetchUrl: `https://github.com/o/${name}.git`,
    pushUrl: `https://github.com/o/${name}.git`,
    ...overrides,
  };
}

/**
 * One conflicted path.
 *
 * `bothModified` by default because it is the commonest, and because it is the
 * only kind where all three controls mean something - so a test that does not
 * care about the kind gets the row with the most on it.
 */
export function makeConflict(
  relativePath: string,
  kind: GitConflictKind = "bothModified",
): GitConflict {
  return {
    path: `/root/${relativePath}`,
    relativePath,
    kind,
  };
}
