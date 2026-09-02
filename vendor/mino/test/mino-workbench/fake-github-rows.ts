import type {
  GitHubIssue,
  GitHubJob,
  GitHubProbe,
  GitHubPullRequest,
  GitHubReviewThread,
  GitHubRun,
} from "@/Types";

/**
 * The rows and probes the GitHub tests are written against.
 *
 * Split from `fake-github.ts` so neither file grows past the project's
 * ceiling - the arrangement `fake-git-refs.ts` already uses. The three probe
 * constants carry Rust's own sentences verbatim, so a test that asserts what
 * the reader is told is asserting the sentence they will actually see.
 */
/** A ready probe on a repository with `main` as its default branch. */
export const READY_PROBE: GitHubProbe = {
  availability: "ready",
  repository: {
    nameWithOwner: "MinaLouisLeon/mino-terminal",
    url: "https://github.com/MinaLouisLeon/mino-terminal",
    defaultBranch: "main",
  },
  detail: null,
};

/** What a machine with no `gh` answers. The sentence is Rust's. */
export const ABSENT_PROBE: GitHubProbe = {
  availability: "absent",
  repository: null,
  detail:
    "The GitHub CLI (gh) is not installed, or is not on PATH. Install it from cli.github.com to see checks, pull requests and issues here.",
};

export const UNAUTHENTICATED_PROBE: GitHubProbe = {
  availability: "unauthenticated",
  repository: null,
  detail:
    "The GitHub CLI is not signed in. Run `gh auth login` in the terminal below, then refresh this view.",
};

export function makeRun(overrides: Partial<GitHubRun> = {}): GitHubRun {
  return {
    id: 918_273,
    workflow: "CI",
    title: "feat(github): the checks section",
    branch: "main",
    state: "passed",
    url: "https://github.com/o/r/actions/runs/918273",
    startedMs: 1_788_082_872_000,
    ...overrides,
  };
}

export function makeJob(overrides: Partial<GitHubJob> = {}): GitHubJob {
  return {
    name: "build",
    state: "passed",
    url: "https://github.com/o/r/actions/runs/918273/job/1",
    ...overrides,
  };
}

export function makePull(
  number: number,
  overrides: Partial<GitHubPullRequest> = {},
): GitHubPullRequest {
  return {
    number,
    title: `A pull request numbered ${number}`,
    author: "MinaLouisLeon",
    url: `https://github.com/o/r/pull/${number}`,
    state: "open",
    isDraft: false,
    headRef: "feat/x",
    baseRef: "main",
    checks: "passed",
    updatedMs: 1_788_082_872_000,
    body: null,
    ...overrides,
  };
}

export function makeIssue(
  number: number,
  overrides: Partial<GitHubIssue> = {},
): GitHubIssue {
  return {
    number,
    title: `An issue numbered ${number}`,
    author: "someone",
    url: `https://github.com/o/r/issues/${number}`,
    state: "open",
    labels: [],
    updatedMs: 1_788_082_872_000,
    ...overrides,
  };
}

/**
 * One review thread, placeable by default.
 *
 * `outdated: true` is the case worth reaching for in a test: it is the one
 * where the diff a comment was written against is no longer current, so the
 * thread has no line and must never be drawn against one.
 */
export function makeThread(
  id: number,
  overrides: Partial<GitHubReviewThread> = {},
): GitHubReviewThread {
  return {
    id,
    path: "src/main.rs",
    line: 4,
    outdated: false,
    resolved: false,
    comments: [
      {
        id,
        author: "a-reviewer",
        body: "This could be clearer.",
        url: `https://github.com/o/r/pull/1#discussion_r${id}`,
        createdMs: 1_788_082_872_000,
      },
    ],
    ...overrides,
  };
}
