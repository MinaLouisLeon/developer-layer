import { ChangeRowProvider } from "../context/ChangeRowContext";
import type { ChangeGroupModel, SourceControlState } from "../types";
import { ChangeRow } from "./ChangeRow";

interface ChangeGroupProps {
  group: ChangeGroupModel;
  selectedPath: string | null;
  busy: boolean;
  handlers: SourceControlState["rowHandlers"];
  /** The group-level control, rendered in the header. */
  children?: React.ReactNode;
}

/**
 * One group - "Staged changes" or "Changes" - with its count and its rows.
 *
 * Renders nothing when empty rather than an empty heading: two headers over
 * nothing is noise, and the pane has a proper empty state of its own.
 */
export function ChangeGroup({
  group,
  selectedPath,
  busy,
  handlers,
  children,
}: ChangeGroupProps) {
  if (group.rows.length === 0) return null;

  return (
    <section aria-label={group.label} className="py-1">
      <header className="flex items-center gap-2 px-2 py-1">
        <h3 className="text-xs font-medium uppercase tracking-wide text-textMuted">
          {group.label}
        </h3>
        <span className="rounded bg-surfaceHover px-1.5 text-xs text-textMuted">
          {group.rows.length}
        </span>
        <span className="ml-auto flex items-center gap-1">{children}</span>
      </header>
      {group.rows.map((row) => (
        // Keyed by path *and* group: one entry can be in both groups at once,
        // which is the whole reason the two-state shape exists.
        <ChangeRowProvider
          key={`${group.id}:${row.entry.path}`}
          value={{
            row,
            selected: row.entry.path === selectedPath,
            busy,
            ...handlers,
          }}
        >
          <ChangeRow>
            <ChangeRow.Open />
            <ChangeRow.State />
            <ChangeRow.Actions />
          </ChangeRow>
        </ChangeRowProvider>
      ))}
    </section>
  );
}
