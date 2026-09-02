import type { DirectoryMap, TreeRowModel } from "./types";

/**
 * Flattens the loaded directory map into the rows the pane renders.
 *
 * Pure on purpose: the lazy-load state machine is the part worth testing, and
 * this is where its result becomes visible.
 */
export function flattenTree(
  root: string | null,
  directories: DirectoryMap,
  expanded: ReadonlySet<string>,
): TreeRowModel[] {
  if (!root) return [];
  const rows: TreeRowModel[] = [];
  walk(root, 0, directories, expanded, rows, new Set());
  return rows;
}

function walk(
  path: string,
  depth: number,
  directories: DirectoryMap,
  expanded: ReadonlySet<string>,
  rows: TreeRowModel[],
  seen: Set<string>,
): void {
  // A symlink loop would otherwise recurse forever.
  if (seen.has(path)) return;
  seen.add(path);

  const entries = directories[path]?.entries;
  if (!entries) return;

  for (const entry of entries) {
    const state = directories[entry.path];
    const isExpanded = expanded.has(entry.path);
    rows.push({
      entry,
      depth,
      expanded: isExpanded,
      status: state?.status ?? "idle",
      error: state?.error ?? null,
    });
    if (entry.kind === "directory" && isExpanded) {
      walk(entry.path, depth + 1, directories, expanded, rows, seen);
    }
  }
}

/** Toggles membership without mutating the set React is rendering from. */
export function withExpanded(
  current: ReadonlySet<string>,
  path: string,
  expand: boolean,
): Set<string> {
  const next = new Set(current);
  if (expand) {
    next.add(path);
  } else {
    next.delete(path);
  }
  return next;
}
