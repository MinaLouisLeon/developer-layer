import type { GitBranch } from "@/Types";

import { BRANCH_COPY } from "../messages";
import type { BranchState } from "../types";
import { BranchRow } from "./BranchRow";

/**
 * The picker: local branches, then remote ones, then a field that makes a new
 * branch and switches to it.
 *
 * Local first because that is what people switch between; remote below because
 * checking one out is a different act - git makes a local branch tracking it,
 * and putting the two in one flat list would hide that.
 *
 * Presentational. Choosing a row calls `branches.checkout`, which *asks* about
 * unsaved drafts rather than switching - the guard is in the hook, in front of
 * the transport call, and there is no path to a checkout that goes round it.
 */
export function BranchPicker({ branches }: { branches: BranchState }) {
  const { local, remote } = branches.branches;
  const empty = local.length === 0 && remote.length === 0;

  return (
    <div
      role="listbox"
      aria-label={BRANCH_COPY.picker}
      className="absolute inset-x-2 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded border border-borderStrong bg-surfaceRaised shadow-lg"
    >
      {branches.loading && empty ? (
        <p className="px-2 py-1.5 text-xs text-textFaint">
          {BRANCH_COPY.loading}
        </p>
      ) : null}

      {!branches.loading && empty ? (
        <p className="px-2 py-1.5 text-xs text-textFaint">
          {BRANCH_COPY.empty}
        </p>
      ) : null}

      <BranchGroup
        heading={BRANCH_COPY.localHeading}
        rows={local}
        busy={branches.busy}
        onCheckout={branches.checkout}
      />
      <BranchGroup
        heading={BRANCH_COPY.remoteHeading}
        rows={remote}
        busy={branches.busy}
        onCheckout={branches.checkout}
      />

      <form
        className="flex items-center gap-1 border-t border-border p-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          branches.create();
        }}
      >
        <input
          value={branches.newName}
          onChange={(event) => branches.setNewName(event.target.value)}
          disabled={branches.busy}
          aria-label={BRANCH_COPY.newLabel}
          placeholder={BRANCH_COPY.newPlaceholder}
          className="min-w-0 flex-1 rounded border border-border bg-surface px-1.5 py-1 text-xs text-text placeholder:text-textFaint focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
        />
        <button
          type="submit"
          disabled={branches.busy || branches.newName.trim() === ""}
          className="shrink-0 rounded border border-borderStrong px-1.5 py-1 text-xs text-text hover:bg-surfaceHover focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong disabled:opacity-40"
        >
          {BRANCH_COPY.create}
        </button>
      </form>
    </div>
  );
}

interface BranchGroupProps {
  heading: string;
  rows: GitBranch[];
  busy: boolean;
  onCheckout: (branch: GitBranch) => void;
}

/** One heading and its rows, or nothing at all when there are none. */
function BranchGroup({ heading, rows, busy, onCheckout }: BranchGroupProps) {
  if (rows.length === 0) return null;

  return (
    <section aria-label={heading}>
      <h4 className="px-2 pt-1.5 text-xs font-medium uppercase tracking-wide text-textFaint">
        {heading}
      </h4>
      <ul>
        {rows.map((branch) => (
          <BranchRow
            key={branch.name}
            branch={branch}
            busy={busy}
            onCheckout={onCheckout}
          />
        ))}
      </ul>
    </section>
  );
}
