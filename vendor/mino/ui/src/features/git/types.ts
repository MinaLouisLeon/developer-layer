import type { GitEntry, GitFileState, GitRepository } from "@/Types";

/**
 * Why the git surface has nothing to show.
 *
 * Three different silences, and they are not interchangeable. `absent` means
 * the target has no usable git and every git surface stays quiet for the
 * session; `notARepository` is the ordinary case for most folders; `failed`
 * means git answered with something worth reading.
 */
export type GitAvailability =
  | "loading"
  | "ready"
  | "notARepository"
  | "absent"
  | "failed";

export interface GitStatusState {
  availability: GitAvailability;
  repository: GitRepository | null;
  /** Every entry git reported, indexed by absolute path. */
  entries: ReadonlyMap<string, GitEntry>;
  /** True when anything is uncommitted. Ignored entries do not count. */
  dirty: boolean;
  /** Git's own sentence, when it had one. Rendered, never swallowed. */
  error: string | null;
  /** True when git's answer was cut short and the list is partial. */
  truncated: boolean;
}

export interface GitStatusActions {
  /**
   * Re-reads the working tree. Called on explicit events - a save, the window
   * regaining focus - never on a timer, and coalesced so a burst of saves
   * costs one call.
   */
  refresh: () => void;
}

export type GitStatusContextValue = GitStatusState & GitStatusActions;

/** A row's badge: the letter to draw and the token to draw it in. */
export interface GitBadge {
  letter: string;
  /** A `theme/tokens.ts` colour name, used as a Tailwind class suffix. */
  tone: "accent" | "warning" | "danger" | "info" | "textFaint";
  /** Read by screen readers, which cannot make sense of a single letter. */
  label: string;
}

export type GitBadgeMap = Record<GitFileState, GitBadge | null>;
