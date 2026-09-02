import type { GitConflict } from "@/Types";

import { useConflicts } from "../hooks/useConflicts";
import { CONFLICT_COPY } from "../messages";
import { ConflictRow } from "./ConflictRow";

/**
 * The conflicted files - #13.
 *
 * **Above the working tree groups, and not collapsible.** Every other section
 * in this panel is one of those things; this is neither, and both differences
 * are the same decision: a conflict blocks the commit box, so a reader who has
 * not scrolled to it or has not opened it would be left with a disabled button
 * and no explanation.
 *
 * It renders nothing at all when there is nothing conflicted, which is almost
 * always. The section appears when it has something to say.
 *
 * Presentational: every decision it renders comes from `useConflicts`.
 */
export function ConflictSection({ active }: { active: boolean }) {
  const conflicts = useConflicts(active);

  if (conflicts.conflicts.length === 0 && !conflicts.error) return null;

  return (
    <section
      aria-label={CONFLICT_COPY.heading}
      className="border-b border-warning bg-warningMuted/20"
    >
      <header className="px-2 pt-1.5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-warning">
          {CONFLICT_COPY.heading}
        </h3>
        {conflicts.conflicts.length > 0 ? (
          <p className="pb-1 text-xs text-textMuted">
            {CONFLICT_COPY.blocking(conflicts.conflicts.length)}
          </p>
        ) : null}
      </header>

      {conflicts.error ? (
        <p className="px-2 pb-1 text-xs text-danger">{conflicts.error}</p>
      ) : null}

      <ul>
        {conflicts.conflicts.map((conflict: GitConflict) => (
          <ConflictRow
            key={conflict.path}
            conflict={conflict}
            busy={conflicts.busy}
            onResolve={conflicts.resolve}
            onOpen={conflicts.open}
          />
        ))}
      </ul>
    </section>
  );
}
