/**
 * The stash half of the git API.
 *
 * Mirrors `mino_core::transport::GitStashTransport`, and is extended by
 * `GitClient` the way `GitBranchClient` is.
 *
 * Re-exported through `@/Types`, so nothing imports from here directly.
 */
import type { GitStash, StashRequest } from "../generated";

/**
 * Tauri command names. The only place these strings are written down.
 *
 * Keyed by the *method* name rather than a shorter one, as every command map
 * here is: it is what lets "one command per method" be checked by name in
 * `test/mino-workbench/unit/transport-contract.test.ts` instead of by a table
 * somebody has to keep in step.
 */
export const GIT_STASH_COMMANDS = {
  stashList: "git_stash_list",
  stashPush: "git_stash_push",
  stashApply: "git_stash_apply",
  stashDrop: "git_stash_drop",
} as const;

export type GitStashCommand =
  (typeof GIT_STASH_COMMANDS)[keyof typeof GIT_STASH_COMMANDS];

/** Command argument payloads, one per command that takes arguments. */
export type GitStashPushArgs = { request: StashRequest };
export type GitStashIndexArgs = { index: number };
export type GitStashApplyArgs = GitStashIndexArgs & { pop: boolean };

/**
 * The stash surface.
 *
 * **An index is a position, not an identity.** `stash@{0}` means "the top of
 * the stack", and dropping an entry renumbers every entry below it. So the
 * rule every caller follows is: act, then re-read. A list edited locally after
 * a drop would be a list whose numbers no longer point at the entries it is
 * showing, and the next click would act on the wrong one.
 */
export interface GitStashClient {
  /** The stack, most recent first. An empty stack is an empty array. */
  stashList(): Promise<GitStash[]>;

  /**
   * Set the working tree aside and return it to the last commit. **Changes
   * files under the other panes**, exactly as a checkout does, and the same
   * refresh follows it.
   *
   * Untracked files are left alone unless `request.includeUntracked` says
   * otherwise. Stashing a clean tree rejects rather than succeeding silently.
   */
  stashPush(request: StashRequest): Promise<void>;

  /**
   * Put an entry back. `pop` drops it afterwards; `apply` leaves it. A
   * conflict rejects with a sentence saying the entry is still on the stack,
   * so nothing is lost by a pop that could not finish.
   */
  stashApply(index: number, pop: boolean): Promise<void>;

  /**
   * Remove an entry without applying it.
   *
   * **Destructive**: what it removes is reachable only through the reflog
   * afterwards, which this app does not offer. Callers confirm first and name
   * the entry.
   */
  stashDrop(index: number): Promise<void>;
}
