/**
 * The branch half of the git API.
 *
 * A fourth module beside `api.ts`, `git.ts` and `git-history.ts`, mirroring
 * the fourth Rust file: `GitBranchTransport` is a supertrait of
 * `GitTransport`, and `GitBranchClient` is extended by `GitClient`. One
 * surface for callers, one readable file per surface.
 *
 * Re-exported through `@/Types`, so nothing imports from here directly.
 */
import type { CreateBranchRequest, GitBranch } from "../generated";

/** Tauri command names. The only place these strings are written down. */
export const GIT_BRANCH_COMMANDS = {
  branches: "git_branches",
  checkout: "git_checkout",
  createBranch: "git_create_branch",
  deleteBranch: "git_delete_branch",
} as const;

export type GitBranchCommand =
  (typeof GIT_BRANCH_COMMANDS)[keyof typeof GIT_BRANCH_COMMANDS];

/** Command argument payloads, one per command that takes arguments. */
export type GitBranchNameArgs = { name: string };
export type GitCreateBranchArgs = { request: CreateBranchRequest };
export type GitDeleteBranchArgs = GitBranchNameArgs & { force: boolean };

/**
 * Mirrors `mino_core::transport::GitBranchTransport`.
 *
 * What separates these from everything before them: `checkout` **changes files
 * under the other three panes**. Nothing on this interface refreshes anything -
 * the caller fires one "git state changed" event afterwards and every pane
 * re-reads at the same moment, rather than each guessing. See
 * `features/git/context/GitRefreshContext`.
 */
export interface GitBranchClient {
  /**
   * Every branch the picker can offer, local and remote in one call, each with
   * its upstream, ahead/behind counts and tip commit.
   *
   * A repository with no commits answers with an empty list rather than
   * rejecting: `git init` and nothing since is a state, not a failure.
   */
  branches(): Promise<GitBranch[]>;

  /**
   * Switch HEAD, and the working tree with it.
   *
   * Faithful to `git checkout <name>`, which means a *remote-tracking* name
   * detaches HEAD rather than creating a local branch. Callers that mean
   * "start working on this remote branch" send its short name and let git's
   * own DWIM create the tracking branch - see `useBranches`.
   *
   * Rejects, changing nothing, when the branch is not there or the working
   * tree would be overwritten - two different sentences, because they are two
   * different things the reader can act on. Git never switches halfway, so a
   * rejection means the repository is exactly as it was.
   *
   * Warning about an unsaved editor draft happens **before** this is called.
   * Git knows nothing about a buffer that was never written, so nothing below
   * this line can protect one.
   */
  checkout(name: string): Promise<void>;

  /**
   * Create a branch, and switch to it when `request.checkout` is set.
   *
   * Resolves with the branch that now exists rather than `void`, so the picker
   * shows what git made instead of assuming its own request came true. A
   * duplicate name rejects.
   */
  createBranch(request: CreateBranchRequest): Promise<GitBranch>;

  /**
   * Delete a branch. Without `force` git refuses one whose commits are nowhere
   * else, and refuses the branch you are on.
   *
   * With `force` this **destroys commits**, so callers confirm first and say
   * what will be lost - the discard rule, applied to a branch.
   */
  deleteBranch(name: string, force: boolean): Promise<void>;
}
