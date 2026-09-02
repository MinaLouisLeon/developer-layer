import { useCallback, useEffect, useState } from "react";

import type { GitCommit } from "@/Types";
import { useTransport } from "@/context/TransportContext";
import { describeFailure } from "@/lib/transportError";

import { CONFLICT_COPY, SOURCE_CONTROL_COPY } from "../messages";
import type { CommitState } from "../types";

/** How long the "committed" confirmation stays up. A flash, not a state. */
const LANDED_MS = 4000;

interface CommitBoxInput {
  stagedCount: number;
  /**
   * How many paths a merge has left unsettled.
   *
   * Git refuses to commit while any path is unmerged, and this is the check
   * the reader actually sees. The two are not redundant - git's is the one
   * that is definitely right - but this is the one that stops somebody typing
   * a paragraph they cannot use.
   */
  conflictCount: number;
  busy: boolean;
  /** The panel's action runner: awaits, then refreshes the tree. */
  run: (action: () => Promise<unknown>) => void;
}

/**
 * The commit box.
 *
 * Split from `useSourceControl` because it is the one part with state of its
 * own that outlives an action - the typed message - and that is precisely the
 * thing most worth being careful with.
 *
 * **The message survives a failure.** It is cleared only after the transport
 * has said the commit landed. A box that emptied itself on submit would lose
 * a paragraph of typing to a missing `user.email`, and there is nowhere to get
 * it back from.
 */
export function useCommitBox({
  stagedCount,
  conflictCount,
  busy,
  run,
}: CommitBoxInput): CommitState {
  const transport = useTransport();
  const [message, setMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [landed, setLanded] = useState<string | null>(null);

  const blocked = blockedReason(message, stagedCount, conflictCount);

  const commit = useCallback(() => {
    if (blocked || committing || busy) return;
    setCommitting(true);
    setError(null);
    run(async () => {
      try {
        const made: GitCommit = await transport.git.commit({
          message,
          all: false,
          amend: false,
        });
        // Only now. Until this line the text is the only copy there is.
        setMessage("");
        setLanded(SOURCE_CONTROL_COPY.committed(made.shortSha, made.summary));
      } catch (failure) {
        // Handled here and *not* rethrown. The panel's runner would record it
        // too, and the reader would get the same sentence twice - once under
        // the message box and once above the list. A commit failure belongs to
        // the box, which is where the message it failed to commit still is.
        setError(describeFailure(failure));
      } finally {
        setCommitting(false);
      }
    });
  }, [blocked, committing, busy, run, transport, message]);

  // The confirmation is a flash, not a state; it should not linger next to a
  // box the user has started typing in again.
  useEffect(() => {
    if (!landed) return;
    const timer = window.setTimeout(() => setLanded(null), LANDED_MS);
    return () => window.clearTimeout(timer);
  }, [landed]);

  return {
    message,
    setMessage: useCallback((next: string) => {
      setMessage(next);
      setLanded(null);
    }, []),
    committing,
    blocked,
    error,
    landed,
    commit,
  };
}

/**
 * Why the button is unavailable, as a sentence rather than a silent disabled
 * state - "nothing happens when I click commit" is a bad way to learn that
 * nothing is staged.
 */
function blockedReason(
  message: string,
  stagedCount: number,
  conflictCount: number,
): string | null {
  // First, because it is the one the reader can do nothing about from this
  // box: an unsettled merge blocks the commit whatever is staged and whatever
  // is typed, and saying "stage something" instead would send them the wrong
  // way entirely.
  if (conflictCount > 0) return CONFLICT_COPY.needsResolving;
  if (message.trim() === "") return SOURCE_CONTROL_COPY.needsMessage;
  if (stagedCount === 0) return SOURCE_CONTROL_COPY.needsStaged;
  return null;
}
