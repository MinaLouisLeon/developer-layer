import { useEffect, useState } from "react";

import { useTransport } from "@/context/TransportContext";
import { describeFailure } from "@/lib/transportError";

import type { BranchListModel } from "../types";

const EMPTY: BranchListModel = { current: null, local: [], remote: [] };

/**
 * Reading the branch list, split from `useBranches` so that hook stays the
 * actions and this one stays the read.
 *
 * **The list is read when the picker opens, not held.** Branches change under
 * this app - a fetch in the terminal beside it, a checkout in another
 * window - and a list cached from when the pane mounted would offer a branch
 * that is no longer there. Opening the picker is the moment the answer
 * matters, and `nonce` is how an action asks for it again afterwards.
 */
export function useBranchList(open: boolean, nonce: number) {
  const transport = useTransport();
  const [branches, setBranches] = useState<BranchListModel>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const listed = await transport.git.branches();
        if (cancelled) return;
        setBranches(split(listed));
        setError(null);
      } catch (failure) {
        if (cancelled) return;
        setBranches(EMPTY);
        setError(describeFailure(failure));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, nonce, transport]);

  return { branches, loading, error };
}

/**
 * Git's own order, split into the two lists the picker shows.
 *
 * Not re-sorted: git lists local branches first, then remote, each
 * alphabetically, and a second ordering here would be a second thing to keep
 * in agreement with it.
 */
function split(listed: BranchListModel["local"]): BranchListModel {
  return {
    current: listed.find((branch) => branch.isHead) ?? null,
    local: listed.filter((branch) => !branch.isRemote),
    remote: listed.filter((branch) => branch.isRemote),
  };
}
