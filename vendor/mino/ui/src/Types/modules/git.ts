/**
 * The git half of the transport API.
 *
 * A second module beside `api.ts` for the same reason `GitTransport` is a
 * second trait beside `Transport` in Rust: git's twenty-five eventual methods
 * would make one file that mirrors neither interface, and "is there git here?"
 * is better asked once than answered by every method. See `plan/decisions.md`
 * D2.
 *
 * Both are re-exported through `@/Types`, so nothing imports from here
 * directly.
 */
import type {
  CommitRequest,
  GitCommit,
  GitRepository,
  GitStatus,
} from "../generated";
import type { GitBranchClient } from "./git-branches";
import type { GitConflictClient, GitRemoteClient } from "./git-remote";
import type { GitHistoryClient } from "./git-history";
import type { GitStashClient } from "./git-stash";

/**
 * Tauri command names for the git surface. The only place these strings are
 * written down.
 */
export const GIT_COMMANDS = {
  repository: "git_repository",
  status: "git_status",
  stage: "git_stage",
  unstage: "git_unstage",
  discard: "git_discard",
  commit: "git_commit",
} as const;

export type GitCommand = (typeof GIT_COMMANDS)[keyof typeof GIT_COMMANDS];

/** Argument payloads for the git commands that take any. */
export type GitPathsArgs = { paths: string[] };
export type GitCommitArgs = { request: CommitRequest };

/**
 * Mirrors `mino_core::transport::GitTransport`, reached from the client the
 * way `Transport::git()` reaches it in Rust: `transport.git.status()`.
 *
 * Split the way the trait is. Two methods read the working tree - they serve
 * the tree's badges, the header's branch and dirty marker, and the search
 * walk's ignore predicate, all from one `GitStatus`. Four change it: the
 * source control panel. Five more read *history*, eight move between branches
 * and set work aside, and six more talk to a remote or settle a conflict.
 * Those groups live in `./git-history`, `./git-branches`, `./git-stash` and
 * `./git-remote`, and are inherited here, so `client.git` stays one surface
 * however many files describe it.
 */
export interface GitClient
  extends GitHistoryClient,
    GitBranchClient,
    GitStashClient,
    GitRemoteClient,
    GitConflictClient {
  /**
   * The repository containing the connected root, or `null` when the root is
   * not inside one. `null` is an answer, not a failure: most folders are not
   * repositories and the UI renders that quietly.
   *
   * Git being absent from the target *is* a failure, and this is the call that
   * reports it - once, so every git surface can go quiet for the session
   * instead of failing per call.
   */
  repository(): Promise<GitRepository | null>;

  /**
   * The working tree as git sees it. One call for the whole repository, not
   * one per file. Rejects when the connected folder is not a repository, so
   * callers ask `repository()` first.
   */
  status(): Promise<GitStatus>;

  /**
   * Stage paths. An empty array stages everything, which is what the
   * group-level control sends.
   *
   * Paths are absolute - `GitEntry.path`, as it came back from `status()` -
   * and Rust guards every one of them against the connected root before git
   * sees it. A batch containing one path outside the root runs for none of
   * them.
   */
  stage(paths: string[]): Promise<void>;

  /** Remove paths from the index. Cannot lose work: the files are untouched. */
  unstage(paths: string[]): Promise<void>;

  /**
   * Throw away working-tree changes.
   *
   * **The one call here that destroys data.** What it undoes exists nowhere
   * else, so callers confirm first, name what will be lost, and never style it
   * as the primary action - see `features/source-control`. It restores tracked
   * files and does not delete untracked ones.
   */
  discard(paths: string[]): Promise<void>;

  /**
   * Commit what is staged, returning the commit so the UI can say it landed.
   * Rejects when nothing is staged and when the message is empty.
   */
  commit(request: CommitRequest): Promise<GitCommit>;
}
