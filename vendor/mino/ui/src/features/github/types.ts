import type {
  GitHubAvailability,
  GitHubCreated,
  GitHubIssue,
  GitHubJob,
  GitHubPullRequest,
  GitHubRepository,
  GitHubRun,
} from "@/Types";

/**
 * What the GitHub view knows about the session, asked once and remembered.
 *
 * `availability` carries the probe's four states plus two of the view's own:
 * `loading` while the probe is in flight, and `failed` when the probe itself
 * went wrong - which is a different thing from any of the four and is the only
 * one worth a sentence from the error path.
 *
 * `detail` is `gh`'s own words, and is **untrusted text**. It is rendered as
 * text like every other value on this surface.
 */
export type GitHubViewState =
  | GitHubAvailability
  | "loading"
  | "failed"
  | "notConnected";

export interface GitHubContextValue {
  state: GitHubViewState;
  repository: GitHubRepository | null;
  /** The sentence to show when `state` is not `ready`. */
  detail: string | null;
  /**
   * The branch every section scopes itself to, from the git status the rest of
   * the workbench already reads. `null` on a detached HEAD or an unborn
   * branch, which is why the checks section has a sentence for having no
   * branch at all.
   *
   * **Read `branchKnown` before believing a `null`.**
   */
  branch: string | null;

  /**
   * Whether git has answered yet.
   *
   * `branch` is `null` both when there is no branch *and* before the status
   * has been read - and `useGitStatus` deliberately waits a moment before it
   * asks, so that second window is real on every session. Treating the two as
   * one meant a link built in that window named the repository's default
   * branch instead of the one you are on, and the checks section said "there
   * is no branch checked out" about a branch that was simply not read yet.
   *
   * So `branch === null` means "there is no branch" **only** once this is
   * true. Until then it means "not yet".
   */
  branchKnown: boolean;
  /**
   * Bumped by the header's refresh and by a branch change. Every section keys
   * its read on this - which is the whole of the polling policy: on mount, on
   * a branch change, and when a reader asks. Never on a timer.
   */
  nonce: number;
  refresh: () => void;

  /**
   * The pull request whose review comments the editor is showing, or `null`.
   *
   * Held here rather than in the pull request section because the *viewer*
   * reads it: threads are drawn in the editor's gutter, and the editor knows
   * nothing about a list in the sidebar. Set by an explicit control on a pull
   * request row - nothing appears in the editor that the reader did not ask
   * for.
   */
  reviewing: number | null;
  review: (number: number | null) => void;
}

/** What one section's read produced. The shape every section hook returns. */
export interface SectionQuery<T> {
  data: T | null;
  loading: boolean;
  /** Rendered, never swallowed. Each section shows its own. */
  error: string | null;
}

/** The collapsible half every section has, whatever it is showing. */
export interface SectionDisclosure {
  open: boolean;
  toggle: () => void;
}

export interface ChecksState extends SectionDisclosure {
  run: GitHubRun | null;
  loading: boolean;
  error: string | null;
  /** Read only for a run that failed, and only for that run. */
  failingJobs: GitHubJob[];
  jobsLoading: boolean;
}

export interface PullRequestsState extends SectionDisclosure {
  pulls: GitHubPullRequest[];
  loading: boolean;
  error: string | null;
  /** The number whose description is showing, or `null`. */
  selected: number | null;
  select: (number: number | null) => void;
  detail: GitHubPullRequest | null;
  detailLoading: boolean;
}

export interface IssuesState extends SectionDisclosure {
  issues: GitHubIssue[];
  loading: boolean;
  error: string | null;
}

/** The form, its confirmation, and what came back. */
export interface NewPullRequestState extends SectionDisclosure {
  title: string;
  setTitle: (title: string) => void;
  body: string;
  setBody: (body: string) => void;
  base: string;
  setBase: (base: string) => void;
  draft: boolean;
  toggleDraft: () => void;

  /** Set by asking, cleared by confirming or cancelling. */
  confirming: boolean;
  ask: () => void;
  cancel: () => void;
  confirm: () => void;

  busy: boolean;
  error: string | null;
  created: GitHubCreated | null;
}
