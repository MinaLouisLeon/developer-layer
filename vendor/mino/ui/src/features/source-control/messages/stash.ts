/**
 * The stash section's copy.
 *
 * "Pop" and "apply" are git's own words and are kept, because a reader who
 * knows git would be more confused by a rewording than helped by one. Each
 * carries a title saying what it does.
 */
export const STASH_COPY = {
  heading: "Stash",
  show: "Show the stash",
  hide: "Hide the stash",
  loading: "Reading the stash…",
  empty: "Nothing stashed.",
  errorTitle: "Could not read the stash",

  messagePlaceholder: "Stash message (optional)",
  messageLabel: "Stash message",
  push: "Stash changes",
  includeUntracked: "Include untracked files",
  includeUntrackedTitle:
    "Also set aside files git is not tracking. Off by default, so nothing git has never seen moves unless you ask.",

  apply: "Apply, keeping this entry",
  pop: "Apply and remove this entry",
  drop: "Delete this entry",
  onBranch: (branch: string) => `on ${branch}`,

  /** The destructive confirmation, worded like discard's. */
  dropTitle: "Delete this stash?",
  dropBody: (message: string) =>
    `“${message}” will be deleted without being applied. The changes in it are not committed anywhere, so this cannot be undone.`,
  dropConfirm: "Delete it",
  dropCancel: "Keep it",
} as const;
