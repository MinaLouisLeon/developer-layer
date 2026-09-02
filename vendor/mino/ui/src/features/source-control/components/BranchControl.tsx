import { ChevronDown } from "lucide-react";

import { useBranches } from "../hooks/useBranches";
import { BRANCH_COPY } from "../messages";
import { BranchPicker } from "./BranchPicker";
import { CheckoutConfirm } from "./CheckoutConfirm";

/**
 * The branch strip above the changes: which branch you are on, and the control
 * that changes it.
 *
 * The header strip in `GitBranchStatus` keeps *showing* the branch, because it
 * is visible with the source control pane closed. This is where you change it,
 * and the two read the same `GitRepository` so they cannot disagree about the
 * name.
 *
 * Presentational: every decision it renders comes from `useBranches`.
 */
export function BranchControl({ active }: { active: boolean }) {
  const branches = useBranches(active);
  const name = branches.detached
    ? BRANCH_COPY.noBranch
    : (branches.currentName ?? BRANCH_COPY.noBranch);

  return (
    <div className="relative border-b border-border px-2 py-1.5">
      <button
        type="button"
        onClick={branches.toggle}
        disabled={branches.busy}
        aria-expanded={branches.open}
        aria-haspopup="listbox"
        title={branches.detached ? BRANCH_COPY.detachedTitle : BRANCH_COPY.picker}
        className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-text hover:bg-surfaceHover focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong disabled:opacity-50"
      >
        <span aria-hidden="true" className="shrink-0 text-textFaint">
          &#x2387;
        </span>
        <span className="sr-only">{BRANCH_COPY.label}: </span>
        <span
          className={`min-w-0 truncate ${branches.detached ? "text-warning" : ""}`}
        >
          {name}
        </span>
        {branches.busy ? null : (
          <ChevronDown
            size={12}
            strokeWidth={1.5}
            aria-hidden="true"
            className="ml-auto shrink-0 text-textFaint"
          />
        )}
      </button>

      {branches.error ? (
        <p className="px-1 pt-1 text-xs text-danger">{branches.error}</p>
      ) : null}

      {branches.open ? <BranchPicker branches={branches} /> : null}

      <CheckoutConfirm
        prompt={branches.prompt}
        onConfirm={branches.confirmCheckout}
        onCancel={branches.cancelCheckout}
      />
    </div>
  );
}
