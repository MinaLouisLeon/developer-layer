import type { GitEntry, GitFileState } from "@/Types";

import { GIT_STATE_LABELS } from "./messages";
import type { GitBadge, GitBadgeMap } from "./types";

/**
 * One badge per file state.
 *
 * The tones are `theme/tokens.ts` names, never colour values - this file has
 * no idea what `warning` looks like, which is the point. `unmodified` and
 * `ignored` draw no badge: a clean side has nothing to say, and an ignored row
 * is expressed by dimming the whole row the way a hidden file already is.
 */
export const GIT_BADGES: GitBadgeMap = {
  unmodified: null,
  ignored: null,
  modified: { letter: "M", tone: "warning", label: GIT_STATE_LABELS.modified },
  added: { letter: "A", tone: "accent", label: GIT_STATE_LABELS.added },
  deleted: { letter: "D", tone: "danger", label: GIT_STATE_LABELS.deleted },
  renamed: { letter: "R", tone: "info", label: GIT_STATE_LABELS.renamed },
  copied: { letter: "C", tone: "info", label: GIT_STATE_LABELS.copied },
  untracked: { letter: "U", tone: "accent", label: GIT_STATE_LABELS.untracked },
  conflicted: {
    letter: "!",
    tone: "danger",
    label: GIT_STATE_LABELS.conflicted,
  },
  typeChanged: {
    letter: "T",
    tone: "warning",
    label: GIT_STATE_LABELS.typeChanged,
  },
};

/** Tailwind text classes, written out so the class names survive the scan. */
export const GIT_BADGE_CLASSES = {
  accent: "text-accent",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  textFaint: "text-textFaint",
} as const;

/**
 * The one badge a row shows.
 *
 * An entry has two states, and a row has one badge, so something has to
 * choose. The unstaged side wins when it has anything to say, because that is
 * the change the person is making right now; the staged side is what shows
 * once the work tree is clean again. A file staged and then modified again
 * therefore reads as modified, which is what it is.
 */
export function badgeFor(entry: GitEntry): GitBadge | null {
  return GIT_BADGES[entry.worktree] ?? GIT_BADGES[entry.index];
}

/** True for a row git is deliberately not looking at. */
export function isIgnored(state: GitFileState): boolean {
  return state === "ignored";
}
