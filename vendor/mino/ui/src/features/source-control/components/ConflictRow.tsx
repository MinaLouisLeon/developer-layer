import type { ConflictResolution, GitConflict, GitConflictKind } from "@/Types";

import { CONFLICT_COPY } from "../messages";

interface ConflictRowProps {
  conflict: GitConflict;
  busy: boolean;
  onResolve: (path: string, resolution: ConflictResolution) => void;
  onOpen: (conflict: GitConflict) => void;
}

/** One phrase per kind. The reader has to know which they are looking at. */
const KIND_LABELS: Record<GitConflictKind, string> = {
  bothModified: CONFLICT_COPY.bothModified,
  bothAdded: CONFLICT_COPY.bothAdded,
  bothDeleted: CONFLICT_COPY.bothDeleted,
  addedByUs: CONFLICT_COPY.addedByUs,
  addedByThem: CONFLICT_COPY.addedByThem,
  deletedByUs: CONFLICT_COPY.deletedByUs,
  deletedByThem: CONFLICT_COPY.deletedByThem,
};

/** Where there is no file on one side, editing it is not one of the answers. */
const DELETES: GitConflictKind[] = [
  "bothDeleted",
  "deletedByUs",
  "deletedByThem",
];

const ACTION =
  "rounded border border-borderStrong px-1.5 py-0.5 text-xs text-text hover:bg-surfaceHover focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong disabled:opacity-40";

/**
 * One conflicted path, with what happened to it and the three ways out.
 *
 * **The buttons do not say "ours" and "theirs".** Every reader has to
 * translate those at least once, and translating them wrong throws away the
 * wrong side of somebody's work. They say which version is kept.
 *
 * The kind is spelled out under the name for the same reason: "take the
 * incoming version" means keep a file when both sides changed it, and means
 * delete a file when the other side removed it. A row that did not say which
 * situation it was would be a row where the same button does two very
 * different things.
 *
 * "Mark as settled" is offered last and carries the warning, because it is the
 * one that does nothing to the file - if the conflict markers are still in it,
 * git will stage them exactly as they are.
 */
export function ConflictRow({
  conflict,
  busy,
  onResolve,
  onOpen,
}: ConflictRowProps) {
  const deleted = DELETES.includes(conflict.kind);

  return (
    <li className="flex flex-col gap-1 border-b border-border px-2 py-1.5 last:border-b-0">
      <button
        type="button"
        onClick={() => onOpen(conflict)}
        title={CONFLICT_COPY.open}
        className="truncate text-left text-xs text-text hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
      >
        {conflict.relativePath}
      </button>
      <span className="text-xs text-warning">{KIND_LABELS[conflict.kind]}</span>

      <span className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => onResolve(conflict.path, "ours")}
          className={ACTION}
        >
          {CONFLICT_COPY.takeOurs}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onResolve(conflict.path, "theirs")}
          className={ACTION}
        >
          {CONFLICT_COPY.takeTheirs}
        </button>
        {/* Not offered where one side has no file: there is nothing to open,
            edit and mark settled. */}
        {deleted ? null : (
          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve(conflict.path, "manual")}
            title={CONFLICT_COPY.markResolvedHint}
            className={ACTION}
          >
            {CONFLICT_COPY.markResolved}
          </button>
        )}
      </span>
    </li>
  );
}
