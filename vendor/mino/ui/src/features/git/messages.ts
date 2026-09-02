/**
 * User-facing git copy.
 *
 * Kept out of the components so the strings stay shallow and a future
 * translation pass has one file to reach for.
 */
export const GIT_COPY = {
  /** The header's dirty marker. A dot, not a word: it sits beside a branch. */
  dirtyMarker: "●",
  dirtyLabel: "This branch has uncommitted changes",
  cleanLabel: "This branch has no uncommitted changes",

  detached: "detached",
  detachedLabel: "HEAD is detached; there is no branch checked out",
  unbornLabel: "This branch has no commits yet",

  aheadLabel: (count: number) =>
    `${count} commit${count === 1 ? "" : "s"} to push`,
  behindLabel: (count: number) =>
    `${count} commit${count === 1 ? "" : "s"} to pull`,

  /** Shown once, quietly, when the target has no git at all. */
  absent: "git is not available here",

  truncated: "Git reported more changes than this list can show.",
} as const;

/**
 * One phrase per file state, for the badge's accessible label. The letter on
 * its own is a convention a screen reader cannot be expected to know.
 */
export const GIT_STATE_LABELS = {
  modified: "Modified",
  added: "Added",
  deleted: "Deleted",
  renamed: "Renamed",
  copied: "Copied",
  untracked: "Untracked",
  ignored: "Ignored by git",
  conflicted: "Conflicted",
  typeChanged: "Type changed",
} as const;
