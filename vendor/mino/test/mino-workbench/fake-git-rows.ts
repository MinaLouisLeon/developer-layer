import type { GitCommit, GitEntry, GitRepository } from "@/Types";

/**
 * The git rows and constants the tests are written against.
 *
 * Split from `fake-git.ts` so neither file grows past the project's ceiling -
 * the arrangement `fake-github-rows.ts` and `fake-git-remote-rows.ts` already
 * use.
 */

/** A repository on `main`, clean, tracking `origin/main`. */
export const CLEAN_REPOSITORY: GitRepository = {
  root: "/root",
  branch: "main",
  head: "3f2a1c9",
  detached: false,
  upstream: "origin/main",
  ahead: 0,
  behind: 0,
};

/** The commit a successful `commit()` reports, unless a test says otherwise. */
export const LANDED_COMMIT: GitCommit = {
  sha: "3f2a1c9d8e7b6a5f4e3d2c1b0a9f8e7d6c5b4a39",
  shortSha: "3f2a1c9",
  summary: "A committed change",
  author: "Test",
  timestampMs: 1_788_024_729_000,
};

/** One status entry, with the two sides defaulted to a plain modification. */
export function makeGitEntry(
  path: string,
  overrides: Partial<GitEntry> = {},
): GitEntry {
  return {
    path,
    relativePath: path.replace(/^\/root\//, ""),
    index: "unmodified",
    worktree: "modified",
    originalPath: null,
    ...overrides,
  };
}
