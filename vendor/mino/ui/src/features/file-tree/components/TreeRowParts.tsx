import { GIT_BADGE_CLASSES } from "@/features/git/badges";
import { useGitEntry } from "@/features/git/hooks/useGitEntry";

import { useTreeRow } from "../context/TreeRowContext";

const INDENT_PER_LEVEL_PX = 14;

/** Depth spacing. A spacer element keeps the label text alignment honest. */
export function TreeRowIndent() {
  const { row } = useTreeRow();
  return (
    <span
      aria-hidden="true"
      className="shrink-0"
      style={{ width: row.depth * INDENT_PER_LEVEL_PX }}
    />
  );
}

/** Disclosure marker. Files render a blank of the same width so names line up. */
export function TreeRowChevron() {
  const { row } = useTreeRow();
  const isDirectory = row.entry.kind === "directory";
  return (
    <span aria-hidden="true" className="w-3 shrink-0 text-center text-textFaint">
      {isDirectory ? (row.expanded ? "\u25be" : "\u25b8") : ""}
    </span>
  );
}

export function TreeRowIcon() {
  const { row } = useTreeRow();
  const glyph = ICONS[row.entry.kind];
  return (
    <span aria-hidden="true" className="w-3 shrink-0 text-center text-textFaint">
      {glyph}
    </span>
  );
}

const ICONS = {
  directory: "\u25a0",
  file: "\u25cf",
  symlink: "\u2192",
  other: "\u25cb",
} as const;

export function TreeRowLabel() {
  const { row, selected } = useTreeRow();
  const { ignored } = useGitEntry(row.entry.path);
  // An ignored entry is dimmed exactly the way a hidden one already is,
  // rather than being given a tone of its own: both mean "here, but not what
  // you are looking for", and the tree should say that one way.
  const tone = selected
    ? "text-accentStrong"
    : row.entry.hidden || ignored
      ? "text-textFaint"
      : "text-text";
  return <span className={`truncate ${tone}`}>{row.entry.name}</span>;
}

/**
 * The git badge: one letter, in the tone for what happened to the file.
 *
 * A new part rather than a change to an existing one, so a row without git
 * renders precisely as it did before - this returns `null` and the row is
 * unchanged. The letter is `aria-hidden` and paired with a real word, because
 * a screen reader cannot be expected to know that "M" means modified.
 */
export function TreeRowGitStatus() {
  const { row } = useTreeRow();
  const { badge } = useGitEntry(row.entry.path);
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

/** Per-row loading and error state; a failed level does not blank the tree. */
export function TreeRowStatus() {
  const { row } = useTreeRow();
  if (row.status === "loading") {
    return (
      <span className="ml-auto shrink-0 pl-2 text-xs text-textFaint">
        Loading…
      </span>
    );
  }
  if (row.status === "error" && row.error) {
    return (
      <span className="ml-auto shrink-0 truncate pl-2 text-xs text-danger">
        {row.error}
      </span>
    );
  }
  return null;
}
