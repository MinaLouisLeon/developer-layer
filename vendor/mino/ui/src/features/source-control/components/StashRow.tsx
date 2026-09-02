import { Trash2, Undo2, Upload } from "lucide-react";

import type { GitStash } from "@/Types";
import { absoluteTime } from "@/lib/relativeTime";

import { STASH_COPY } from "../messages";

interface StashRowProps {
  entry: GitStash;
  /** True while any stash action is in flight. */
  busy: boolean;
  /** Already formatted, so the row does no date arithmetic. */
  age: string;
  onApply: (index: number, pop: boolean) => void;
  onDrop: (entry: GitStash) => void;
}

const ACTION_CLASSES =
  "rounded p-1 text-textFaint hover:bg-surfaceHover hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong disabled:opacity-40";

/**
 * One stash entry: its message, the branch it came from, and how long ago.
 *
 * The three actions are git's own, and keep git's names. Apply and pop differ
 * by one thing - whether the entry survives - and each says which in its
 * title, because a reader who guesses wrong loses an entry.
 *
 * Drop is styled as the destructive one and *asks* rather than acting, the
 * same way a discard does.
 */
export function StashRow({ entry, busy, age, onApply, onDrop }: StashRowProps) {
  return (
    <li className="group flex items-center gap-2 px-2 py-1 text-xs hover:bg-surfaceHover">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-text" title={entry.message}>
          {entry.message}
        </span>
        <span className="block truncate text-textFaint">
          {entry.branch ? `${STASH_COPY.onBranch(entry.branch)} \u00b7 ` : ""}
          <span title={absoluteTime(entry.timestampMs)}>{age}</span>
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => onApply(entry.index, false)}
          title={STASH_COPY.apply}
          className={ACTION_CLASSES}
        >
          <Undo2 size={14} strokeWidth={1.5} aria-hidden="true" />
          <span className="sr-only">{STASH_COPY.apply}</span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onApply(entry.index, true)}
          title={STASH_COPY.pop}
          className={ACTION_CLASSES}
        >
          <Upload size={14} strokeWidth={1.5} aria-hidden="true" />
          <span className="sr-only">{STASH_COPY.pop}</span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDrop(entry)}
          title={STASH_COPY.drop}
          className={`${ACTION_CLASSES} hover:text-danger`}
        >
          <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
          <span className="sr-only">{STASH_COPY.drop}</span>
        </button>
      </span>
    </li>
  );
}
