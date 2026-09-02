import { useGitStatusContext } from "../context/GitStatusContext";
import { badgeFor, isIgnored } from "../badges";
import type { GitBadge } from "../types";

export interface GitDecoration {
  badge: GitBadge | null;
  /** True for a path git is deliberately not looking at. */
  ignored: boolean;
}

const NONE: GitDecoration = { badge: null, ignored: false };

/**
 * What one path's row should show.
 *
 * A lookup rather than a prop, because the whole working tree arrives in one
 * `git status` and every row wants its own line out of it. Handing each row
 * its entry would mean the tree re-deriving the map on every render.
 *
 * Returns nothing to draw when there is no repository, no git, or nothing read
 * yet - which is what makes a folder that is not a checkout render exactly as
 * it did before this feature existed.
 */
export function useGitEntry(path: string): GitDecoration {
  const { entries } = useGitStatusContext();
  const entry = entries.get(path);
  if (!entry) return NONE;
  return {
    badge: badgeFor(entry),
    ignored: isIgnored(entry.worktree) && isIgnored(entry.index),
  };
}
