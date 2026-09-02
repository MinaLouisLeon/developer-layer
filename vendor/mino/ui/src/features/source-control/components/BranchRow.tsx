import { Check } from "lucide-react";

import type { GitBranch } from "@/Types";

import { BRANCH_COPY } from "../messages";

interface BranchRowProps {
  branch: GitBranch;
  /** True while a checkout or a create is in flight. */
  busy: boolean;
  onCheckout: (branch: GitBranch) => void;
}

/**
 * One branch: its name, a tick when it is the one you are on, and how far it
 * has drifted from its upstream.
 *
 * The current branch's row is disabled rather than hidden. Seeing where you
 * are in the list you are choosing from is the point, and a row that vanished
 * would make the list shift under the cursor as you switch.
 */
export function BranchRow({ branch, busy, onCheckout }: BranchRowProps) {
  const upstream = branch.upstream
    ? BRANCH_COPY.tracking(branch.upstream)
    : BRANCH_COPY.noUpstream;

  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={branch.isHead}
        disabled={busy || branch.isHead}
        onClick={() => onCheckout(branch)}
        title={`${branch.name} \u2014 ${upstream}`}
        className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs hover:bg-surfaceHover focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong disabled:opacity-60"
      >
        <span className="w-3 shrink-0 text-accent">
          {branch.isHead ? (
            <>
              <Check size={12} strokeWidth={2} aria-hidden="true" />
              <span className="sr-only">{BRANCH_COPY.currentSuffix}</span>
            </>
          ) : null}
        </span>
        <span className="min-w-0 flex-1 truncate text-text">{branch.name}</span>
        {branch.ahead > 0 ? (
          <span className="shrink-0 text-textFaint" title={BRANCH_COPY.ahead(branch.ahead)}>
            &#x2191;{branch.ahead}
            <span className="sr-only">{BRANCH_COPY.ahead(branch.ahead)}</span>
          </span>
        ) : null}
        {branch.behind > 0 ? (
          <span className="shrink-0 text-textFaint" title={BRANCH_COPY.behind(branch.behind)}>
            &#x2193;{branch.behind}
            <span className="sr-only">{BRANCH_COPY.behind(branch.behind)}</span>
          </span>
        ) : null}
      </button>
    </li>
  );
}
