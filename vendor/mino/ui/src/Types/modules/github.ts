/**
 * The GitHub half of the transport API.
 *
 * A third module beside `api.ts` and `git.ts`, mirroring the third trait in
 * Rust. Where git needed four modules for nineteen methods, this needs one for
 * two: the caller picks a `GitHubQuery` variant and Rust owns the `gh`
 * subcommand behind it, so five features share one call.
 *
 * That trade is worth naming because it shows up at every call site. Asking is
 * a variant and reading is a variant, so a caller has to say what it expected
 * - which is what `expect*` below is for. The alternative was ten methods, ten
 * Tauri commands and ten client methods for what is one shape of question.
 *
 * **No credential exists on this surface.** Every call ends in a `gh` process
 * that owns its own authentication in the OS keychain. Nothing here reads,
 * holds or forwards a token, because there is none to hold.
 *
 * Re-exported through `@/Types`, so nothing imports from here directly.
 */
import type { GitHubProbe, GitHubQuery, GitHubResponse } from "../generated";

/**
 * Tauri command names for the GitHub surface. The only place these strings are
 * written down.
 *
 * Keyed by the *method* name, as every command map here is: it is what lets
 * "one command per method" be checked by name in
 * `test/mino-workbench/unit/transport-contract.test.ts` instead of by a table
 * somebody has to keep in step.
 */
export const GITHUB_COMMANDS = {
  probe: "github_probe",
  query: "github_query",
} as const;

export type GitHubCommand =
  (typeof GITHUB_COMMANDS)[keyof typeof GITHUB_COMMANDS];

/** Argument payload for the one command that takes any. */
export type GitHubQueryArgs = { request: GitHubQuery };

/**
 * How many rows a list query asks for.
 *
 * Written here rather than generated, because ts-rs exports types and not
 * constants. Rust owns the real rule and clamps every limit into
 * `1..=MAX_GITHUB_LIMIT` regardless of what is sent, so this being wrong would
 * cost a differently-sized page and never a request nobody meant - see
 * `mino_core::github::command::limit`.
 *
 * Twenty is a screenful. Every one of these rows is a real API call made on
 * somebody's account, and asking for a hundred to show ten spends a budget the
 * reader cannot see.
 */
export const GITHUB_LIST_LIMIT = 20;

/**
 * Mirrors `mino_core::transport::GitHubTransport`, reached from the client the
 * way `Transport::github()` reaches it in Rust: `transport.github.probe()`.
 */
export interface GitHubClient {
  /**
   * Whether `gh` is present and signed in, and what repository the remote
   * points at. Cheap enough to call on mount.
   *
   * Its four states are four different facts, and three of them are quiet
   * absences rather than failures - no `gh`, no login, no GitHub remote. Every
   * section reads this once and stays quiet for the session when it is not
   * `ready`; nothing else here may be called before it has answered.
   */
  probe(): Promise<GitHubProbe>;

  /**
   * One `gh` subcommand, named by a variant.
   *
   * The probe is not re-asked here: callers ask `probe()` once and act on the
   * answer, and every section in `features/github` is rendered only when it
   * came back `ready`. A probe in front of each query would be two extra `gh`
   * processes per call, on a surface whose whole polling policy is about not
   * spending somebody's rate limit.
   *
   * Every call is bounded by a timeout in Rust: a stalled request becomes a
   * sentence in one section rather than a view that never finishes loading.
   *
   * **`createPullRequest` writes.** Callers confirm first and show exactly
   * what will be created - see `features/github`.
   */
  query(request: GitHubQuery): Promise<GitHubResponse>;
}

/**
 * The name of the response a query should answer with.
 *
 * Written down once so a caller narrows by naming what it asked for rather
 * than by matching a variant inline - which is the same thing five sections
 * would otherwise each write out.
 */
export type GitHubResponseKind = GitHubResponse["kind"];

/**
 * The payload of one response variant, or a rejection naming the mismatch.
 *
 * The cost of one call serving five features is that the answer arrives
 * tagged. This is where that cost is paid, once: a section asks for `runs` and
 * gets `GitHubRun[]`, and a response of the wrong shape is a typed error
 * rather than a value silently read as something it is not.
 */
export type GitHubDetail<K extends GitHubResponseKind> = Extract<
  GitHubResponse,
  { kind: K }
>["detail"];
