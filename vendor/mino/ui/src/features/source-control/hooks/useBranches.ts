import { useCallback, useState } from "react";

import { useTransport } from "@/context/TransportContext";
import { useNotifyGitRefresh } from "@/features/git/context/GitRefreshContext";
import { useGitStatusContext } from "@/features/git/context/GitStatusContext";
import type { GitBranch } from "@/Types";
import { describeFailure } from "@/lib/transportError";

import type { BranchState } from "../types";
import { useBranchList } from "./useBranchList";
import { useCheckoutGuard } from "./useCheckoutGuard";

/**
 * The branch control's state.
 *
 * Reading the list is `useBranchList`; this is what the controls do with it.
 *
 * **A checkout announces itself once, whether it worked or not.** It changes
 * files under the tree, the viewer and search, so one `notify` goes out and
 * every pane re-reads. On failure too: a call that failed is exactly when the
 * panes must read from git rather than assume nothing moved.
 */
export function useBranches(active: boolean): BranchState {
  const transport = useTransport();
  const { repository } = useGitStatusContext();
  const notify = useNotifyGitRefresh();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Two errors, not one. Every action ends by re-reading the list, and a
  // single slot would have the successful re-read wipe the sentence explaining
  // why the action itself failed - which is the sentence the reader needs.
  const [actionError, setActionError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  /** Bumped after every action, to re-read the list rather than edit it. */
  const [nonce, setNonce] = useState(0);

  const list = useBranchList(active && open, nonce);

  /** Runs one branch action, then tells every pane the tree may have moved. */
  const run = useCallback(
    (action: () => Promise<unknown>) => {
      setBusy(true);
      setActionError(null);
      void (async () => {
        try {
          await action();
          setOpen(false);
        } catch (failure) {
          setActionError(describeFailure(failure));
        } finally {
          setBusy(false);
          setNonce((current) => current + 1);
          notify();
        }
      })();
    },
    [notify],
  );

  const checkout = useCallback(
    (name: string) => run(() => transport.git.checkout(name)),
    [run, transport],
  );

  // Asking and acting are two functions, and `checkout` is reached from one.
  const guard = useCheckoutGuard(checkout);

  /**
   * What a row actually means, which is not always the name printed on it.
   *
   * `git checkout origin/feature` **detaches HEAD** - it names a commit, not a
   * branch. `git checkout feature` creates a local branch tracking it, which
   * is what somebody clicking `origin/feature` in a picker means. So a remote
   * row is checked out by its short name and git's own DWIM does the rest;
   * when two remotes both have that name git refuses, and the refusal is
   * shown.
   */
  const ask = useCallback(
    (branch: GitBranch) => guard.ask(localName(branch)),
    [guard],
  );

  const create = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    // Create *and* switch: the picker's field is where somebody starts work,
    // and a branch made but not entered is a surprise more often than a wish.
    //
    // No draft warning, and that is not an oversight. The branch starts at
    // HEAD, so `git checkout -b` writes nothing to the working tree - there is
    // no file for an unsaved edit to be stranded by.
    run(() =>
      transport.git.createBranch({ name, from: null, checkout: true }),
    );
  }, [newName, run, transport]);

  return {
    open,
    toggle: useCallback(() => setOpen((current) => !current), []),
    branches: list.branches,
    // From the status headers, not the list: the header strip shows a branch
    // before the picker has ever been opened, and one call already answered.
    currentName: repository?.branch ?? null,
    detached: repository?.detached ?? false,
    loading: list.loading,
    busy,
    // The action's failure first: it is the one the reader just caused.
    error: actionError ?? list.error,
    checkout: ask,
    prompt: guard.prompt,
    confirmCheckout: guard.confirm,
    cancelCheckout: guard.cancel,
    newName,
    setNewName,
    create,
  };
}

/** `origin/feature` becomes `feature`; a local name is already itself. */
function localName(branch: GitBranch): string {
  if (!branch.isRemote) return branch.name;
  const slash = branch.name.indexOf("/");
  return slash === -1 ? branch.name : branch.name.slice(slash + 1);
}
