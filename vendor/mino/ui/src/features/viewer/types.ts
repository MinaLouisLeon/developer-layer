import type { RefObject } from "react";

import type {
  FilePayload,
  GitBlameLine,
  GitFileDiff,
  GitHubReviewThread,
} from "@/Types";

export type ViewerStatus = "empty" | "loading" | "ready" | "error";

export interface ViewerState {
  status: ViewerStatus;
  payload: FilePayload | null;
  /** Already-friendly copy; guards (too large, binary) land here too. */
  error: string | null;
  /** True when the failure is a deliberate guard rather than a fault. */
  guarded: boolean;
}

/** One file's unsaved edit, remembered while the session lasts. */
export interface Draft {
  /** What the editor holds. */
  content: string;
  /** What was on disk when it was loaded, so "dirty" is a comparison. */
  baseline: string;
}

export interface EditorState {
  draft: string | null;
  /** Last known disk content. `null` until a file loads. */
  baseline: string | null;
  /** Modification time of `baseline`, sent back to guard against clobbering. */
  savedModifiedMs: number | null;
  saving: boolean;
  /** Already-friendly copy for a failed save. */
  saveError: string | null;
  /** Briefly true after a successful save, for the confirmation. */
  justSaved: boolean;
}

/**
 * What the viewer is showing.
 *
 * `file` is the editor. `diff` is read-only and never touches the draft - the
 * two are different renderings of the same selection, not different documents.
 */
export type ViewerMode = "file" | "diff";

export interface ViewerModeContextValue {
  mode: ViewerMode;
  setMode: (mode: ViewerMode) => void;
  /** The blame gutter. Off by default: it changes the editor's shape. */
  blame: boolean;
  toggleBlame: () => void;
  /**
   * When set, `diff` shows what this commit did to the file rather than what
   * the working tree has. Written by the history list.
   */
  commit: string | null;
  showCommitFile: (revision: string, path: string, name: string) => void;
  clearCommit: () => void;
}

export type DiffStatus = "idle" | "loading" | "ready" | "error";

export interface FileDiffState {
  status: DiffStatus;
  /** `null` when the file has no changes to show. */
  file: GitFileDiff | null;
  truncated: boolean;
  error: string | null;
}

export interface BlameState {
  /** Keyed by one-based line number, so the gutter is a lookup. */
  byLine: ReadonlyMap<number, GitBlameLine>;
  loading: boolean;
  error: string | null;
}

export interface CodeMirrorOptions {
  /** Initial document. Only read when `revision` changes. */
  content: string | null;
  extension: string | null;
  editable: boolean;
  /** Bumped once per file load, so typing does not rebuild the view. */
  revision: number;
  onChange: (doc: string) => void;
  onSave: () => void;
  /**
   * False while the diff is showing. The editor stays mounted rather than
   * being torn down and rebuilt, so an unsaved draft and the cursor survive a
   * trip through diff mode - but a hidden CodeMirror measures itself wrong, so
   * it is told when it comes back.
   */
  visible: boolean;
  /** Per-line authorship for the gutter, or `null` when blame is off. */
  blame: ReadonlyMap<number, GitBlameLine> | null;
  /**
   * Review threads for the open file, or an empty array.
   *
   * Only the placeable ones are drawn - see `features/github/reviewGutter`.
   * An outdated thread has no line and is listed in the panel below the
   * editor instead of being pinned to one it might not belong to.
   */
  review: readonly GitHubReviewThread[];
  /** Called when a gutter marker is pressed, with the line it sits on. */
  onOpenReview: (line: number) => void;
}

/**
 * What `useCodeMirror` hands back.
 *
 * The container ref is what it always returned. `currentLine` was added for
 * #19, and is a **function rather than state** on purpose: the line the cursor
 * is on is only wanted at the moment somebody asks for a link to it, and
 * keeping it in React would be a re-render on every arrow key to answer a
 * question nobody had yet asked.
 */
export interface CodeMirrorHandle {
  container: RefObject<HTMLDivElement | null>;
  /** 1-based, as editors and GitHub both count. `null` with no editor. */
  currentLine: () => number | null;
}

export interface EditorStatusProps {
  name: string;
  dirty: boolean;
  saving: boolean;
  justSaved: boolean;
  onSave: () => void;
}
