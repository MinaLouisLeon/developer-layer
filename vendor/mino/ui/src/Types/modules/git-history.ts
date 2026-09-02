/**
 * The read-only half of the git API: diff, log, show and blame.
 *
 * A third module beside `api.ts` and `git.ts`, for the same reason the Rust
 * trait is split across files - reading history and changing the repository
 * are different jobs, and only one of them can lose anything.
 *
 * Re-exported through `@/Types`, so nothing imports from here directly.
 */
import type {
  DiffRequest,
  GitBlame,
  GitCommitDetail,
  GitDiff,
  GitLog,
  LogRequest,
} from "../generated";

/** Tauri command names. The only place these strings are written down. */
export const GIT_HISTORY_COMMANDS = {
  diff: "git_diff",
  log: "git_log",
  show: "git_show",
  commitDiff: "git_commit_diff",
  blame: "git_blame",
} as const;

export type GitHistoryCommand =
  (typeof GIT_HISTORY_COMMANDS)[keyof typeof GIT_HISTORY_COMMANDS];

/** Command argument payloads, one per command that takes arguments. */
export type GitDiffArgs = { request: DiffRequest };
export type GitLogArgs = { request: LogRequest };
export type GitShowArgs = { revision: string };
export type GitCommitDiffArgs = GitShowArgs & { path: string | null };
export type GitBlameArgs = { path: string };

/**
 * Mirrors the reading half of `mino_core::transport::GitTransport`.
 *
 * Everything here arrives already parsed: hunks with line numbers on both
 * sides, blame expanded per line. A renderer that read a patch itself would be
 * a second implementation of git's format - see
 * `docs/mino-workbench/git-module.md`.
 */
export interface GitHistoryClient {
  /**
   * A file's diff, or the whole tree's when `request.path` is null. Bounded:
   * `GitDiff.truncated` says when the answer was cut, and a binary file
   * reports `binary` with no hunks rather than megabytes of noise.
   */
  diff(request: DiffRequest): Promise<GitDiff>;

  /**
   * Commits, newest first, paged by `skip`. An unborn branch answers with an
   * empty page rather than rejecting: a repository with no commits has no
   * history, which is a state and not a failure.
   */
  log(request: LogRequest): Promise<GitLog>;

  /** One commit with the files it touched. */
  show(revision: string): Promise<GitCommitDetail>;

  /**
   * The diff one commit introduced - a different question from `diff`, which
   * compares two states the caller names. Works on a root commit, which has no
   * parent to compare against.
   */
  commitDiff(revision: string, path: string | null): Promise<GitDiff>;

  /**
   * Per-line authorship. On demand only: this is the most expensive read on
   * the interface and nothing should ask for it just because a file opened.
   */
  blame(path: string): Promise<GitBlame>;
}
