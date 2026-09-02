import { useCallback, useEffect, useState } from "react";

import type { GitStash } from "@/Types";
import { useTransport } from "@/context/TransportContext";
import { useNotifyGitRefresh } from "@/features/git/context/GitRefreshContext";
import { describeFailure } from "@/lib/transportError";

import type { StashState } from "../types";

/**
 * The stash section's state.
 *
 * **An index is a position, not an identity.** `stash@{0}` means "the top of
 * the stack", so dropping an entry renumbers every entry below it. Every
 * action here therefore ends in a re-read of the whole list rather than a
 * local edit of it - a list whose numbers no longer match the rows it is
 * showing is a list where the next click acts on the wrong entry, and that is
 * a way to lose work.
 *
 * Push, apply and pop all change files under the other panes, so each one
 * announces a working-tree change the way a checkout does. A drop does not
 * touch the working tree at all - it only removes an entry - but it still
 * re-reads the list, because the numbers moved.
 */
export function useStash(active: boolean): StashState {
  const transport = useTransport();
  const notify = useNotifyGitRefresh();

  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<GitStash[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  // Two errors, not one: every action re-reads the list, and a single slot
  // would have that re-read wipe the sentence explaining why a pop conflicted.
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(false);
  const [prompt, setPrompt] = useState<GitStash | null>(null);
  const [nonce, setNonce] = useState(0);

  // Read when the section is opened, not when the pane mounts. Most
  // repositories have nothing stashed, and the section is collapsed by
  // default; a call for every session would be a call for nothing.
  useEffect(() => {
    if (!active || !open) return;
    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const listed = await transport.git.stashList();
        if (cancelled) return;
        setEntries(listed);
        setListError(null);
      } catch (failure) {
        if (cancelled) return;
        setEntries([]);
        setListError(describeFailure(failure));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active, open, nonce, transport]);

  /**
   * Runs one stash action, then re-reads the list and tells the panes.
   *
   * `notify` fires whether the call succeeded or not: a pop that hit a
   * conflict has already written conflict markers into the working tree, and
   * the panes showing those files are stale the moment it returns.
   */
  const run = useCallback(
    (action: () => Promise<unknown>) => {
      setBusy(true);
      setActionError(null);
      void (async () => {
        try {
          await action();
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

  const push = useCallback(() => {
    const text = message.trim();
    setMessage("");
    setOpen(true);
    run(() =>
      transport.git.stashPush({
        message: text === "" ? null : text,
        includeUntracked,
      }),
    );
  }, [message, includeUntracked, run, transport]);

  const apply = useCallback(
    (index: number, pop: boolean) =>
      run(() => transport.git.stashApply(index, pop)),
    [run, transport],
  );

  // Asking and acting are two functions, as they are for discard: drop is the
  // one action here that can lose work outright.
  const confirmDrop = useCallback(() => {
    if (!prompt) return;
    const { index } = prompt;
    setPrompt(null);
    run(() => transport.git.stashDrop(index));
  }, [prompt, run, transport]);

  return {
    open,
    toggle: useCallback(() => setOpen((current) => !current), []),
    entries,
    loading,
    busy,
    // The action's failure first: it is the one the reader just caused.
    error: actionError ?? listError,
    message,
    setMessage,
    includeUntracked,
    toggleUntracked: useCallback(
      () => setIncludeUntracked((current) => !current),
      [],
    ),
    push,
    apply,
    askDrop: useCallback((entry: GitStash) => setPrompt(entry), []),
    prompt,
    confirmDrop,
    cancelDrop: useCallback(() => setPrompt(null), []),
  };
}
