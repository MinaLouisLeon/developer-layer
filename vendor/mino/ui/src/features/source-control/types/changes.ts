import type { GitChangedFile, GitCommit, GitEntry, GitFileState } from "@/Types";

/**
 * Which side of the index a row belongs to.
 *
 * A `GitEntry` carries two states, so one entry can appear in **both** groups -
 * staged and then modified again is a real and common condition, and hiding
 * half of it would be the panel lying about the tree.
 */
export type ChangeGroupId = "staged" | "changes";

/** One row: an entry, seen from one group's side. */
export interface ChangeRowModel {
  entry: GitEntry;
  group: ChangeGroupId;
  /** The state that put it in this group - `index` or `worktree`. */
  state: GitFileState;
  /** Repository-relative, split for display. */
  name: string;
  directory: string;
}

export interface ChangeGroupModel {
  id: ChangeGroupId;
  label: string;
  rows: ChangeRowModel[];
}

/** What a row's own controls do. Same shape for both groups; the group decides. */
export interface ChangeRowContextValue {
  row: ChangeRowModel;
  selected: boolean;
  busy: boolean;
  /** Opens the file in the viewer, through the shared `SelectionContext`. */
  onOpen: (row: ChangeRowModel) => void;
  /** Stage for a `changes` row, unstage for a `staged` one. */
  onToggleStaged: (row: ChangeRowModel) => void;
  /** Only offered on `changes` rows, and only for tracked files. */
  onDiscard: (row: ChangeRowModel) => void;
}

/**
 * A pending destructive action, held until the user answers.
 *
 * Modelled as state rather than a `window.confirm`, because the confirmation
 * has to name what will be lost and say what the button will do - neither of
 * which a native confirm can be trusted to render the same way twice.
 */
export interface DiscardPrompt {
  /** Absolute paths. Empty means everything, which the copy spells out. */
  paths: string[];
  /** What the sentence names: one file, or a count. */
  label: string;
}

export interface CommitState {
  message: string;
  setMessage: (message: string) => void;
  /** True while the commit is in flight. */
  committing: boolean;
  /** Why the button is not available, or `null` when it is. */
  blocked: string | null;
  /** The last failure, kept until the next attempt. */
  error: string | null;
  /** The commit that just landed, shown briefly. */
  landed: string | null;
  commit: () => void;
}

export interface HistoryState {
  commits: GitCommit[];
  /** True when git had more than this page. Drives "show more". */
  more: boolean;
  loading: boolean;
  error: string | null;
  /** The expanded commit, or `null`. */
  openSha: string | null;
  /** The open commit's files, or `null` while they are being read. */
  files: GitChangedFile[] | null;
  openCommit: (sha: string) => void;
  openFile: (file: GitChangedFile) => void;
  loadMore: () => void;
}

export interface SourceControlState {
  /** `null` until git has answered; the pane renders its own quiet states. */
  groups: ChangeGroupModel[];
  stagedCount: number;
  changesCount: number;
  /** Non-null while any action is in flight; blocks the controls. */
  busy: boolean;
  error: string | null;
  prompt: DiscardPrompt | null;
  confirmDiscard: () => void;
  cancelDiscard: () => void;
  stageAll: () => void;
  unstageAll: () => void;
  discardAll: () => void;
  rowHandlers: Pick<
    ChangeRowContextValue,
    "onOpen" | "onToggleStaged" | "onDiscard"
  >;
  commitState: CommitState;
}
