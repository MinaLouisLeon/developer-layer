import type { GitPullResult, GitPushResult } from "@/Types";

import { REMOTE_COPY } from "./messages";

/**
 * What a remote call did, as one sentence.
 *
 * Split from `useRemote` because it is a mapping and not state, and because
 * the mapping is the point: a pull has **five** answers and each one is a
 * different next move. "Already up to date" means stop; "fast-forwarded" means
 * carry on; "merged" means look at what came in; "conflicted" means the
 * working tree has markers in it right now. Collapsing them to "pulled" would
 * put the reader back to comparing two lists to find out which happened.
 */
export function pulled(result: GitPullResult): string {
  switch (result.outcome) {
    case "alreadyUpToDate":
      return REMOTE_COPY.pulledUpToDate;
    case "fastForwarded":
      return REMOTE_COPY.pulledFastForward(result.remote);
    case "rebased":
      return REMOTE_COPY.pulledRebased(result.remote);
    case "conflicted":
      return REMOTE_COPY.pulledConflicted;
    case "merged":
      return REMOTE_COPY.pulledMerged(result.remote);
  }
}

/**
 * The same for a push, which has two.
 *
 * A rejection is not among them: it rejects, because nothing was pushed and
 * the reader has something to do about it.
 */
export function pushed(result: GitPushResult): string {
  return result.outcome === "alreadyUpToDate"
    ? REMOTE_COPY.pushedNothing
    : REMOTE_COPY.pushed(result.remote, result.branch);
}
