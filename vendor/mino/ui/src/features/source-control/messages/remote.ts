/**
 * User-facing copy for the remote controls and the conflict list.
 *
 * Two things in here are worth reading before changing them.
 *
 * **The push confirmation names the branch and the remote**, and the force
 * variant says what force means in the words somebody would use to describe
 * the damage - not "force push?" but what it can overwrite and whose it is.
 * A confirm button that says "OK" tells the reader nothing about what is at
 * stake, which is the same rule the discard wording follows.
 *
 * **The conflict controls do not say "ours" and "theirs".** Every reader has
 * to translate those at least once, and translating them wrong throws away the
 * wrong side. They say which branch's version is kept.
 */
export const REMOTE_COPY = {
  heading: "Remote",
  show: "Show the remote controls",
  hide: "Hide the remote controls",

  fetch: "Fetch",
  fetchHint:
    "Bring down what the remote has, without touching your files. The safe one.",
  pull: "Pull",
  pullHint: "Bring it down and merge it into this branch.",
  push: "Push",
  pushHint: "Send this branch's commits to the remote.",

  working: "Working…",
  noRemote:
    "This repository has no remote configured, so there is nowhere to fetch from or push to.",

  /** What each result says afterwards. Shown briefly, like a commit's. */
  fetched: (remote: string) => `Fetched from ${remote}`,
  pulledUpToDate: "Already up to date",
  pulledFastForward: (remote: string) => `Fast-forwarded from ${remote}`,
  pulledMerged: (remote: string) => `Merged ${remote} into this branch`,
  pulledRebased: (remote: string) => `Rebased onto ${remote}`,
  pulledConflicted:
    "The merge stopped on a conflict. The files below need settling before you can commit.",
  pushed: (remote: string, branch: string) => `Pushed ${branch} to ${remote}`,
  pushedNothing: "Everything was already there",

  rebaseLabel: "Rebase instead of merging",
  rebaseHint:
    "Replays your commits on top of the remote's, rather than making a merge commit.",

  /** The ordinary push confirmation. */
  pushTitle: "Push this branch?",
  pushBody: (remote: string, branch: string) =>
    `${branch} will be sent to ${remote}. Anyone watching the branch will see the commits.`,
  pushConfirm: "Push",
  pushCancel: "Cancel",

  /**
   * The force push. A separate control and a separate confirmation - never
   * offered as a way out of a rejection, because a rejection means somebody
   * else's commits are there and forcing would remove them.
   */
  forceLabel: "Force push",
  forceHint:
    "Overwrite the remote branch with this one. Only for a branch nobody else is working on.",
  forceTitle: "Force push, overwriting the remote?",
  forceBody: (remote: string, branch: string) =>
    `${branch} on ${remote} will be replaced by this branch. Any commits there that are not here will be gone from the branch, including anyone else's.`,
  forceSafety:
    "Git will still refuse if the remote has moved since this repository last looked, so work you have never seen cannot be overwritten.",
  forceConfirm: "Force push",
} as const;

export const CONFLICT_COPY = {
  heading: "Conflicts",
  /** Shown above the working tree groups, because it comes first. */
  blocking: (count: number) =>
    count === 1
      ? "1 file needs settling before you can commit."
      : `${count} files need settling before you can commit.`,

  /** Why the commit button is unavailable. Shown, never silent. */
  needsResolving: "Settle the conflicts above before committing.",

  /** One phrase per kind. The reader has to know which they are looking at. */
  bothModified: "Both sides changed this",
  bothAdded: "Both sides added this",
  bothDeleted: "Both sides deleted this",
  addedByUs: "You added this; the other side did not have it",
  addedByThem: "The other side added this; you did not have it",
  deletedByUs: "You deleted this; the other side changed it",
  deletedByThem: "The other side deleted this; you changed it",

  /**
   * The three controls. Named for which version survives rather than for
   * git's words: "ours" and "theirs" are a translation step, and getting it
   * wrong discards the wrong side.
   */
  takeOurs: "Keep this branch's version",
  takeTheirs: "Keep the incoming version",
  markResolved: "Mark as settled",
  markResolvedHint:
    "Takes the file exactly as it is on disk now. Open it first and remove the conflict markers, or they will be committed.",

  open: "Open this file",
  resolving: "Settling…",
} as const;
