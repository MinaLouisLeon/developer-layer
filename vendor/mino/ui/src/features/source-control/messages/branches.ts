/**
 * The branch control's copy.
 *
 * The checkout warning is the part to be careful with, for the same reason the
 * discard wording is: it stands in front of the only thing in this phase that
 * can lose work. Both of its buttons keep the edit, and both say so.
 */
export const BRANCH_COPY = {
  label: "Branch",
  picker: "Switch branch",
  loading: "Reading branches…",
  empty: "No branches yet.",
  localHeading: "Local",
  remoteHeading: "Remote",
  currentSuffix: "current",
  noBranch: "no branch",
  detachedTitle: "HEAD is detached; there is no branch to switch from",
  ahead: (count: number) => `${count} ahead`,
  behind: (count: number) => `${count} behind`,
  tracking: (upstream: string) => `tracking ${upstream}`,
  noUpstream: "no upstream",

  newPlaceholder: "New branch name",
  newLabel: "New branch name",
  create: "Create and switch",

  errorTitle: "Could not change branch",

  /** The unsaved-draft warning. Neither button throws an edit away. */
  strandTitle: "Unsaved changes",
  strandOne: (name: string, branch: string) =>
    `${name} has edits that are not saved. Switching to ${branch} will change the file on disk underneath them. The edits stay in the editor and are not thrown away, but they will no longer match what is on the branch you are on.`,
  strandMany: (count: number, branch: string) =>
    `${count} files have edits that are not saved. Switching to ${branch} will change those files on disk underneath them. The edits stay in the editor and are not thrown away, but they will no longer match what is on the branch you are on.`,
  strandConfirm: (branch: string) => `Switch to ${branch} anyway`,
  strandCancel: "Stay here and save",
} as const;
