import type { GitStash } from "@/Types";

/**
 * Everything the stash section needs, so its component stays presentational.
 *
 * `index` is the only thing that names an entry to git, and it is a
 * *position*: dropping one renumbers every entry below it. So every action
 * here is followed by a re-read of the list rather than a local edit of it.
 */
export interface StashState {
  /** Collapsed by default: most repositories have nothing stashed. */
  open: boolean;
  toggle: () => void;
  entries: GitStash[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  /** The message field for a new stash, and whether to include untracked. */
  message: string;
  setMessage: (message: string) => void;
  includeUntracked: boolean;
  toggleUntracked: () => void;
  push: () => void;
  apply: (index: number, pop: boolean) => void;
  /** Asks about a drop. Does not act - `confirmDrop` does. */
  askDrop: (entry: GitStash) => void;
  prompt: GitStash | null;
  confirmDrop: () => void;
  cancelDrop: () => void;
}
