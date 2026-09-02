import { Minus, Plus, Undo2 } from "lucide-react";

import { GIT_BADGE_CLASSES, GIT_BADGES } from "@/features/git/badges";

import { useChangeRow } from "../context/ChangeRowContext";
import { isUntracked } from "../grouping";
import { SOURCE_CONTROL_COPY } from "../messages";

/** The filename. Quiet folder trailing after it, as in the search results. */
export function ChangeRowPath() {
  const { row, selected } = useChangeRow();
  return (
    <>
      <span
        className={`shrink-0 truncate ${selected ? "text-accentStrong" : "text-text"}`}
      >
        {row.name}
      </span>
      {row.directory ? (
        <span className="min-w-0 truncate pl-2 text-xs text-textFaint">
          {row.directory}
        </span>
      ) : null}
    </>
  );
}

/**
 * The state letter, in the same tone the file tree uses for it.
 *
 * Read from `features/git/badges` rather than restated here: a file showing
 * `M` in the tree and something else in this panel would be two answers to one
 * question.
 */
export function ChangeRowState() {
  const { row } = useChangeRow();
  const badge = GIT_BADGES[row.state];
  if (!badge) return null;
  return (
    <span
      className={`ml-auto shrink-0 pl-2 text-xs font-semibold ${GIT_BADGE_CLASSES[badge.tone]}`}
      title={badge.label}
    >
      <span aria-hidden="true">{badge.letter}</span>
      <span className="sr-only">{badge.label}</span>
    </span>
  );
}

const ACTION_CLASSES =
  "rounded p-1 text-textFaint hover:bg-surfaceHover hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong disabled:opacity-40";

/**
 * Stage/unstage, and discard.
 *
 * Discard is deliberately the quieter of the two and never the primary style:
 * it is the only control in this panel that can lose work, and it should not
 * look like the obvious thing to click. It is absent entirely on an untracked
 * file, where there is nothing to restore from - with a title saying so rather
 * than a disabled button with no explanation.
 */
export function ChangeRowActions() {
  const { row, busy, onToggleStaged, onDiscard } = useChangeRow();
  const staged = row.group === "staged";
  const untracked = isUntracked(row.entry);

  return (
    <span className="flex shrink-0 items-center gap-0.5 pl-1">
      {!staged && !untracked ? (
        <button
          type="button"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            onDiscard(row);
          }}
          title={SOURCE_CONTROL_COPY.discardRow}
          className={ACTION_CLASSES}
        >
          <Undo2 size={14} strokeWidth={1.5} aria-hidden="true" />
          <span className="sr-only">{SOURCE_CONTROL_COPY.discardRow}</span>
        </button>
      ) : null}
      {!staged && untracked ? (
        <span
          title={SOURCE_CONTROL_COPY.untrackedNotDiscardable}
          aria-hidden="true"
          className="w-6"
        />
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation();
          onToggleStaged(row);
        }}
        title={
          staged ? SOURCE_CONTROL_COPY.unstageRow : SOURCE_CONTROL_COPY.stageRow
        }
        className={ACTION_CLASSES}
      >
        {staged ? (
          <Minus size={14} strokeWidth={1.5} aria-hidden="true" />
        ) : (
          <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
        )}
        <span className="sr-only">
          {staged
            ? SOURCE_CONTROL_COPY.unstageRow
            : SOURCE_CONTROL_COPY.stageRow}
        </span>
      </button>
    </span>
  );
}
