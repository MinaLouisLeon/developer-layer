import { useCallback, useEffect, useRef, useState } from "react";

import type { GitHubRepository } from "@/Types";
import { useTransport } from "@/context/TransportContext";
import { useGitStatusContext } from "@/features/git/context/GitStatusContext";
import { useSessionContext } from "@/features/workbench/context/SessionContext";
import { toTransportError, transportErrorMessage } from "@/lib/transportError";

import type { GitHubContextValue, GitHubViewState } from "../types";

/**
 * The one cheap question, asked once per session and remembered.
 *
 * The shape mirrors `useGitStatus`, deliberately: one call on mount, four
 * possible answers, and every surface reading the result rather than asking
 * again. What is different is what triggers a re-ask. Git re-reads on a save
 * and on window focus, because the working tree changes under it. Nothing
 * about `gh` being installed or a remote pointing at GitHub changes while
 * somebody is typing, so this asks on:
 *
 * - the session changing,
 * - the branch changing - because every section is scoped to a branch,
 * - an explicit refresh.
 *
 * And on nothing else. There is no timer, and no focus listener: coming back
 * to the window is a reason to re-read a working tree and not a reason to
 * spend somebody's API budget.
 *
 * The branch comes from the git status the rest of the workbench already
 * reads, rather than from a second call. Two readings of the same branch could
 * disagree, and the header is the one showing it.
 */
export function useGitHubProbe(): GitHubContextValue {
  const transport = useTransport();
  const { connection } = useSessionContext();
  const { repository: gitRepository, availability } = useGitStatusContext();
  const root = connection?.root ?? null;
  const branch = gitRepository?.branch ?? null;
  // Git has answered, whatever it concluded. Until then a `null` branch means
  // "not read yet" rather than "there is none" - see `GitHubContextValue`.
  const branchKnown = availability !== "loading";

  const [state, setState] = useState<GitHubViewState>("notConnected");
  const [repository, setRepository] = useState<GitHubRepository | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  // Which pull request the editor is showing review comments for. Off by
  // default: nothing appears in the editor that the reader did not ask for.
  const [reviewing, setReviewing] = useState<number | null>(null);
  // Every request carries a sequence number, so a slow early answer that lands
  // after a fast later one is dropped rather than overwriting it.
  const latest = useRef(0);
  // The folder the current answer is about. Compared rather than assumed, so a
  // refresh can be told apart from a different session - see below.
  const probed = useRef<string | null>(null);

  const refresh = useCallback(() => setNonce((current) => current + 1), []);

  useEffect(() => {
    if (!root) {
      latest.current += 1;
      setState("notConnected");
      setRepository(null);
      setDetail(null);
      // A closed session is not a session anybody is reviewing in.
      setReviewing(null);
      return;
    }

    const ticket = (latest.current += 1);
    // **Only a new folder blanks the view.** A refresh keeps what is on
    // screen while it asks again: dropping to a loading state would unmount
    // every section, and the reader would lose their place - the pull request
    // they had open, the issues they had expanded - every time they pressed
    // the button meant to update it.
    if (probed.current !== root) {
      probed.current = root;
      setState("loading");
    }

    void (async () => {
      try {
        const probe = await transport.github.probe();
        if (ticket !== latest.current) return;
        setState(probe.availability);
        setRepository(probe.repository);
        setDetail(probe.detail);
      } catch (failure) {
        if (ticket !== latest.current) return;
        const error = toTransportError(failure);
        setRepository(null);
        // `unimplemented` is the transport saying it has no GitHub surface at
        // all - a permanent condition for the session rather than something to
        // report every time. It is deliberately *not* folded into `absent`:
        // that would read as "install gh", which would not help.
        setState("failed");
        setDetail(transportErrorMessage(error));
      }
    })();
  }, [root, nonce, transport]);

  // The branch is not a dependency of the probe itself - `gh repo view` says
  // the same thing whichever branch is checked out - but the checks section is
  // scoped to one, so a checkout has to reach it.
  //
  // `null` is skipped on purpose, and it is not an edge case: the branch
  // arrives from `git status` a moment *after* this component mounts, so
  // treating that first arrival as a change would make every session start
  // with a second round of calls that ask exactly what the first round asked.
  const previousBranch = useRef(branch);
  useEffect(() => {
    const previous = previousBranch.current;
    previousBranch.current = branch;
    if (previous === null || previous === branch) return;
    refresh();
  }, [branch, refresh]);

  return {
    state,
    repository,
    detail,
    branch,
    nonce,
    refresh,
    reviewing,
    review: setReviewing,
    branchKnown,
  };
}
