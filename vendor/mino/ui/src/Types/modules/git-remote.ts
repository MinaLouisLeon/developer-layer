/**
 * The remote and conflict halves of the git API.
 *
 * Mirrors `mino_core::transport::GitRemoteTransport` and
 * `GitConflictTransport`, and both are extended by `GitClient` the way the
 * branch and stash surfaces are. One module rather than two, because the two
 * arrive together and are read together: a pull is the commonest way to get a
 * conflict, and a conflict is the commonest reason a push has to wait.
 *
 * **This surface holds no credential, and there is none to hold.** Git
 * authenticates with its own helper, the SSH agent or the OS keychain - see
 * `plan/decisions.md` D3. Nothing here takes a password, and no result carries
 * one: every URL and every line of git's own output has been through
 * `mino_core::git::redact` before it reaches TypeScript.
 *
 * Re-exported through `@/Types`, so nothing imports from here directly.
 */
import type {
  ConflictResolution,
  GitConflict,
  GitFetchResult,
  GitPullResult,
  GitPushResult,
  GitRemote,
  PullRequest,
  PushRequest,
} from "../generated";

/**
 * Tauri command names. The only place these strings are written down.
 *
 * Keyed by the *method* name, as every command map here is: it is what lets
 * "one command per method" be checked by name in
 * `test/mino-workbench/unit/transport-contract.test.ts` instead of by a table
 * somebody has to keep in step.
 */
export const GIT_REMOTE_COMMANDS = {
  remotes: "git_remotes",
  fetch: "git_fetch",
  pull: "git_pull",
  push: "git_push",
  conflicts: "git_conflicts",
  resolve: "git_resolve",
} as const;

export type GitRemoteCommand =
  (typeof GIT_REMOTE_COMMANDS)[keyof typeof GIT_REMOTE_COMMANDS];

/** Command argument payloads, one per command that takes arguments. */
export type GitFetchArgs = { remote: string | null };
export type GitPullArgs = { request: PullRequest };
export type GitPushArgs = { request: PushRequest };
export type GitResolveArgs = { path: string; resolution: ConflictResolution };

/**
 * The three calls that leave the machine, ordered by what they can lose.
 *
 * `fetch` can lose nothing. `pull` can lose uncommitted work, and rejects
 * rather than risking it. `push` can lose nothing local - and, with
 * `force`, can lose commits **on the remote** that somebody else pushed.
 */
export interface GitRemoteClient {
  /**
   * Every configured remote, with its fetch and push URLs.
   *
   * The URLs arrive **redacted**: a repository whose `origin` is
   * `https://user:token@host/o/r` is ordinary, and this is not where that
   * string becomes visible. An empty array is a local-only repository, which
   * is a state and not a failure.
   */
  remotes(): Promise<GitRemote[]>;

  /**
   * Bring down refs without touching the working tree.
   *
   * The safe one, and the one to reach for first: it changes nothing you
   * could lose, and it is what makes the header's ahead/behind counts true
   * rather than however stale they were. `null` fetches the branch's
   * configured remote.
   */
  fetch(remote: string | null): Promise<GitFetchResult>;

  /**
   * Bring down refs and merge them into the branch you are on.
   *
   * **Rejects when the working tree is dirty**, rather than merging over it
   * or stashing on the reader's behalf - a stash they did not make is a stash
   * they will not think to look for. The sentence names the two things they
   * can do.
   *
   * The outcome is one of five, not a boolean, and one of them -
   * `conflicted` - is a **state rather than a failure**: the merge stopped,
   * the files are where it left them, and `conflicts()` is how they get
   * settled.
   */
  pull(request: PullRequest): Promise<GitPullResult>;

  /**
   * Send commits to a remote.
   *
   * A rejection **rejects** with a sentence saying nothing was pushed and
   * what to do; it is never quietly retried as a force push.
   *
   * `request.force` is the one control on this interface that can destroy
   * work belonging to somebody else. It is `--force-with-lease` in Rust, it
   * is never offered as a recovery from a rejection, and the UI confirms it
   * separately, naming the remote and the branch.
   */
  push(request: PushRequest): Promise<GitPushResult>;
}

export interface GitConflictClient {
  /**
   * Every path a merge could not settle, with which kind each one is.
   *
   * The kind is the point: taking theirs on a both-modified file keeps a
   * file, and on a deleted-by-them file removes one. An empty array is the
   * ordinary answer - most repositories are not mid-merge - and it is also
   * what the commit box reads to know it may proceed.
   */
  conflicts(): Promise<GitConflict[]>;

  /**
   * Settle one path.
   *
   * `ours` and `theirs` each discard one side. `manual` discards nothing: it
   * takes the file exactly as it is on disk and marks it resolved, which is
   * what makes editing the file in the viewer a first-class way to resolve a
   * conflict rather than something to do in a terminal afterwards.
   *
   * **Changes files under the other panes**, exactly as a checkout does, so
   * the same refresh follows it.
   */
  resolve(path: string, resolution: ConflictResolution): Promise<void>;
}
