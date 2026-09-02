import { useCallback, useEffect, useState } from "react";

import { useTransport } from "@/context/TransportContext";
import { useNotifyGitRefresh } from "@/features/git/context/GitRefreshContext";
import { useGitStatusContext } from "@/features/git/context/GitStatusContext";
import { describeFailure } from "@/lib/transportError";

import { REMOTE_COPY } from "../messages";
import { pulled, pushed } from "../outcomes";
import type { PushPrompt, RemoteState } from "../types";
import { useRemoteList } from "./useRemoteList";

/** How long an outcome stays up. A flash, not a state - like a commit's. */
const OUTCOME_MS = 6000;

/**
 * The three calls that leave the machine.
 *
 * **Asking and pushing are separate functions**, and there are two asking
 * functions rather than one with a flag. `askPush` and `askForcePush` each
 * build their own prompt, and `confirmPush` is the only path to the transport
 * - so a force push cannot be reached through the ordinary confirmation, and a
 * rejected push cannot quietly become a forced one.
 *
 * That last point is the rule the whole hook is shaped around. When a push is
 * rejected, this offers **nothing**: the error names fetching as the fix, and
 * the force control is where it always was. Offering "force?" at the moment
 * somebody has just been told the remote has commits they do not have would be
 * offering to delete exactly those commits.
 *
 * Nothing here polls. A fetch happens when the reader asks for one.
 */
export function useRemote(active: boolean): RemoteState {
  const transport = useTransport();
  const { repository, refresh } = useGitStatusContext();
  const notify = useNotifyGitRefresh();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [rebase, setRebase] = useState(false);
  const [prompt, setPrompt] = useState<PushPrompt | null>(null);

  const remotes = useRemoteList(active && open);
  const branch = repository?.branch ?? null;
  const remote = remotes[0]?.name ?? null;

  /**
   * Runs one remote call, then re-reads.
   *
   * `notify` fires for a pull and a push and not for a fetch, and the
   * difference is real: a fetch moves remote-tracking refs and touches no file
   * on disk, so the tree, the viewer and search have nothing to re-read. A
   * pull can replace every file under them.
   */
  const run = useCallback(
    (action: () => Promise<string>, touchesFiles: boolean) => {
      setBusy(true);
      setError(null);
      setOutcome(null);
      void (async () => {
        try {
          setOutcome(await action());
        } catch (failure) {
          setError(describeFailure(failure));
        } finally {
          setBusy(false);
          refresh();
          // On failure too: a pull that stopped on a conflict has already
          // written markers into files the other panes are showing.
          if (touchesFiles) notify();
        }
      })();
    },
    [refresh, notify],
  );

  const confirmPush = useCallback(() => {
    if (!prompt) return;
    const { remote: target, branch: head, force } = prompt;
    setPrompt(null);
    run(
      async () =>
        pushed(
          // `setUpstream` always: a branch with no upstream has to be given
          // one, and this is the moment it is being pushed anyway. The
          // alternative is a failure whose only fix is a checkbox.
          await transport.git.push({
            remote: target,
            branch: head,
            force,
            setUpstream: true,
          }),
        ),
      true,
    );
  }, [prompt, run, transport]);

  useEffect(() => {
    if (!outcome) return;
    const timer = window.setTimeout(() => setOutcome(null), OUTCOME_MS);
    return () => window.clearTimeout(timer);
  }, [outcome]);

  const ask = useCallback(
    (force: boolean) => {
      if (!remote || !branch) return;
      setPrompt({ remote, branch, force });
    },
    [remote, branch],
  );

  return {
    open,
    toggle: useCallback(() => setOpen((current) => !current), []),
    remotes,
    remote,
    branch,
    busy,
    error,
    outcome,
    rebase,
    toggleRebase: useCallback(() => setRebase((current) => !current), []),
    fetch: useCallback(
      () =>
        run(async () => {
          const result = await transport.git.fetch(remote);
          return REMOTE_COPY.fetched(result.remote);
        }, false),
      [run, transport, remote],
    ),
    pull: useCallback(
      () =>
        run(
          async () => pulled(await transport.git.pull({ remote, rebase })),
          true,
        ),
      [run, transport, remote, rebase],
    ),
    askPush: useCallback(() => ask(false), [ask]),
    askForcePush: useCallback(() => ask(true), [ask]),
    prompt,
    confirmPush,
    cancelPush: useCallback(() => setPrompt(null), []),
  };
}
