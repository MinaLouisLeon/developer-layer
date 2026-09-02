import type { DirEntry, GitEntry, GitFileState } from "@/Types";

import { SOURCE_CONTROL_COPY } from "./messages";
import type { ChangeGroupModel, ChangeRowModel } from "./types";

/**
 * States that put a file in **Staged changes**.
 *
 * `untracked` is deliberately absent: git reports an untracked file with
 * `untracked` on both sides, and a file git has never seen is not staged. It
 * belongs in Changes, where staging it is offered.
 */
const STAGED_STATES: readonly GitFileState[] = [
  "modified",
  "added",
  "deleted",
  "renamed",
  "copied",
  "typeChanged",
];

/**
 * States that put a file in **Changes**. The staged set, plus the two that
 * only ever appear unstaged.
 */
const UNSTAGED_STATES: readonly GitFileState[] = [
  ...STAGED_STATES,
  "untracked",
  "conflicted",
];

/**
 * True for a file git is not tracking, which is the one case discard cannot
 * serve: there is nothing to restore it from.
 */
export function isUntracked(entry: GitEntry): boolean {
  return entry.worktree === "untracked";
}

/**
 * Splits the working tree into the two groups the panel renders.
 *
 * One entry can appear in **both**. Staged and then modified again is a real
 * and common condition, and showing it once would mean picking a side and
 * lying about the other - which is exactly why `GitEntry` carries two states.
 *
 * Ignored entries never appear at all: the tree dims them, and a panel that
 * offered to stage `node_modules` would be offering a mistake.
 */
export function groupEntries(entries: GitEntry[]): ChangeGroupModel[] {
  const staged: ChangeRowModel[] = [];
  const changes: ChangeRowModel[] = [];

  for (const entry of entries) {
    if (STAGED_STATES.includes(entry.index)) {
      staged.push(toRow(entry, "staged", entry.index));
    }
    if (UNSTAGED_STATES.includes(entry.worktree)) {
      changes.push(toRow(entry, "changes", entry.worktree));
    }
  }

  return [
    { id: "staged", label: SOURCE_CONTROL_COPY.staged, rows: sort(staged) },
    { id: "changes", label: SOURCE_CONTROL_COPY.changes, rows: sort(changes) },
  ];
}

function toRow(
  entry: GitEntry,
  group: ChangeRowModel["group"],
  state: GitFileState,
): ChangeRowModel {
  // `relativePath` is git's own answer and always forward-slashed, so this is
  // one split rather than the two-separator dance `lib/path` has to do.
  const cut = entry.relativePath.lastIndexOf("/");
  return {
    entry,
    group,
    state,
    name: cut < 0 ? entry.relativePath : entry.relativePath.slice(cut + 1),
    directory: cut < 0 ? "" : entry.relativePath.slice(0, cut),
  };
}

/**
 * Alphabetical by full path.
 *
 * Stable ordering is not cosmetic here. Rows carry destructive controls, and a
 * list that reshuffles between refreshes is a list where a click can land on
 * the wrong file.
 */
function sort(rows: ChangeRowModel[]): ChangeRowModel[] {
  return rows.sort((a, b) =>
    a.entry.relativePath.localeCompare(b.entry.relativePath),
  );
}

/**
 * How many paths a merge has left unsettled.
 *
 * Beside the grouping because it is the same kind of thing - a fact derived
 * from one `GitStatus` rather than asked for - and because putting it here
 * keeps the panel's hook to wiring.
 *
 * Either side counts. A conflicted path shows `U` on the index side, the
 * worktree side, or both depending on which of the seven shapes it is, and a
 * commit is blocked by all of them.
 */
export function countConflicts(
  entries: ReadonlyMap<string, GitEntry>,
): number {
  return [...entries.values()].filter(
    (entry) => entry.index === "conflicted" || entry.worktree === "conflicted",
  ).length;
}

/**
 * A change row as the selection concept the rest of the app uses.
 *
 * Here rather than in the hook for the same reason `countConflicts` is: it
 * derives one shape from another and holds no state. The `size` and
 * `modifiedMs` are zero and null because the row does not know them and the
 * viewer does not need them - it reads the file itself.
 */
export function entryFor(row: ChangeRowModel): DirEntry {
  return {
    path: row.entry.path,
    name: row.name,
    kind: "file",
    size: 0,
    modifiedMs: null,
    readonly: false,
    hidden: row.name.startsWith("."),
  };
}
