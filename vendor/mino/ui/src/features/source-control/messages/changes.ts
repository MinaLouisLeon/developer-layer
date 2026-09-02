/**
 * User-facing source control copy.
 *
 * Kept out of the components so the strings stay shallow and a future
 * translation pass has one file to reach for.
 *
 * The discard wording is the part to be careful with. A confirm button that
 * says "OK" tells the reader nothing about what is at stake, so every one of
 * these names the file or the count and says what will happen to it.
 */
export const SOURCE_CONTROL_COPY = {
  title: "Source control",

  staged: "Staged changes",
  changes: "Changes",

  stageAll: "Stage all",
  unstageAll: "Unstage all",
  discardAll: "Discard all",
  stageRow: "Stage this file",
  unstageRow: "Unstage this file",
  discardRow: "Discard changes to this file",

  messagePlaceholder: "Message (Ctrl+Enter to commit)",
  messageLabel: "Commit message",
  commit: "Commit",
  committing: "Committing…",
  amendLabel: "Amend the last commit",

  /** Why the commit button is unavailable. Shown, never silent. */
  needsMessage: "Write a commit message first.",
  needsStaged: "Stage something to commit.",

  committed: (shortSha: string, summary: string) =>
    `Committed ${shortSha} · ${summary}`,

  cleanTitle: "Nothing to commit",
  cleanDescription: "The working tree matches the last commit.",
  notARepositoryTitle: "Not a repository",
  notARepositoryDescription:
    "This folder is not inside a git repository, so there is nothing to stage or commit.",
  absentTitle: "git is not available",
  absentDescription:
    "This target has no usable git, so source control is unavailable for this session.",
  loadingTitle: "Reading the working tree…",
  errorTitle: "Could not read the working tree",

  truncated:
    "Git reported more changes than this list can show. Commit or stash some to see the rest.",

  history: "History",
  historyLoading: "Reading history…",
  historyEmpty: "No commits yet.",
  showMore: "Show more",
  commitTouchedNothing: "This commit touched no files.",

  /** The destructive confirmation. */
  discardTitle: "Discard changes?",
  discardOne: (name: string) =>
    `The changes to ${name} will be thrown away. They are not committed or stashed anywhere, so this cannot be undone.`,
  discardMany: (count: number) =>
    `The changes to ${count} file${count === 1 ? "" : "s"} will be thrown away. They are not committed or stashed anywhere, so this cannot be undone.`,
  /** Says what happens, not "OK". */
  discardConfirmOne: (name: string) => `Discard ${name}`,
  discardConfirmMany: (count: number) =>
    `Discard ${count} file${count === 1 ? "" : "s"}`,
  discardCancel: "Keep my changes",

  /**
   * Shown in place of a discard control on an untracked file. Deleting a file
   * git has never seen cannot be undone by any means - no commit, no stash, no
   * reflog - so the panel does not offer to.
   */
  untrackedNotDiscardable:
    "This file is not tracked by git, so there is nothing to restore it from. Delete it yourself if you meant to.",
} as const;
