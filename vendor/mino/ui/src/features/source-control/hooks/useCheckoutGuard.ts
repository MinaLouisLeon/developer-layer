import { useCallback, useState } from "react";

import { useDrafts } from "@/features/viewer/context/DraftsContext";

import type { CheckoutPrompt } from "../types";

/**
 * The gate in front of a checkout that would strand an unsaved edit.
 *
 * **The highest-severity risk in this phase**, and the shape is the safeguard,
 * exactly as it is in `useDiscardPrompt`: asking and acting are two functions,
 * and the transport call is reachable from one of them only.
 *
 * What makes this different from every other guard in the app is that git
 * cannot help. A draft was never written to disk, so `git status` does not
 * know about it, `git checkout` will not refuse because of it, and a stash
 * cannot save it. The only place it can be protected is here, in front of the
 * call.
 *
 * Two things it deliberately does **not** do:
 *
 * - It never discards a draft. Both answers keep the edit: cancel and go save
 *   it, or switch and keep it in memory for when you come back. Throwing away
 *   an unsaved buffer to make a branch switch tidy is not a trade this app
 *   offers.
 * - It never writes a draft out. Saving an edit onto a *different* branch's
 *   file is the other half of the risk in the phase plan, and doing it on the
 *   user's behalf during a checkout is precisely the silent write that must
 *   not happen.
 */
export function useCheckoutGuard(checkout: (name: string) => void) {
  const drafts = useDrafts();
  const [prompt, setPrompt] = useState<CheckoutPrompt | null>(null);

  /**
   * Asks, or goes straight through.
   *
   * The common case is no unsaved edits at all, and a confirmation nobody
   * needs is a confirmation people learn to click past - which would make the
   * one that matters useless.
   */
  const ask = useCallback(
    (name: string) => {
      const unsaved = drafts.unsavedPaths();
      if (unsaved.length === 0) {
        checkout(name);
        return;
      }
      setPrompt({ name, unsaved });
    },
    [drafts, checkout],
  );

  const cancel = useCallback(() => setPrompt(null), []);

  const confirm = useCallback(() => {
    if (!prompt) return;
    const { name } = prompt;
    setPrompt(null);
    // The drafts are left exactly where they are. The viewer re-reads the
    // file from the new branch, and the draft is still in the store for
    // whenever the reader comes back to it.
    checkout(name);
  }, [prompt, checkout]);

  return { prompt, ask, cancel, confirm };
}
