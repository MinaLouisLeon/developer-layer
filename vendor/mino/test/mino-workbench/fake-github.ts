import { vi } from "vitest";

import type {
  GitHubClient,
  GitHubCreated,
  GitHubIssue,
  GitHubJob,
  GitHubProbe,
  GitHubPullRequest,
  GitHubQuery,
  GitHubResponse,
  GitHubReviewThread,
  GitHubRun,
  TransportError,
} from "@/Types";

import { makePull, makeThread } from "./fake-github-rows";

/**
 * The fake GitHub surface, beside `fake-git.ts` for the same reason the git
 * halves are split: neither file grows past the project's ceiling.
 *
 * Everything defaults to **not a GitHub repository**. That is the shape every
 * pane has to survive unchanged, and a fake that was a checkout by default
 * would let a component depend on GitHub without saying so - which is exactly
 * how the viewer's header would quietly start requiring a network.
 *
 * The interesting part is `query`. One method serves five features, so the
 * fake dispatches on the query's own `kind` and answers with the matching
 * response variant - which means a test configures *data*, not a method. It
 * also **records every request**, because half of what these tests are about
 * is what the sections asked for and when: a section that polled, or one that
 * fetched while collapsed, is a bug this list makes visible.
 */
export interface FakeGitHubOptions {
  /**
   * What `probe()` answers. `undefined` means "no GitHub repository here",
   * which is the default for the reason above.
   */
  probe?: Partial<GitHubProbe>;
  runs?: GitHubRun[];
  jobs?: GitHubJob[];
  pulls?: GitHubPullRequest[];
  issues?: GitHubIssue[];
  /** Named for its feature, because the git fake already has a `created`. */
  createdPullRequest?: GitHubCreated;
  browseUrl?: string;
  /** The review threads on any pull request. Defaults to none. */
  reviewThreads?: GitHubReviewThread[];
  /** Keyed by `github.probe` or by a query kind (`github.runs`, …). */
  failures?: Record<string, TransportError>;
}

export interface FakeGitHub {
  client: GitHubClient;
  /** Every query the sections made, in order. */
  requests: GitHubQuery[];
  /** How many of them were of one kind. */
  countOf: (kind: GitHubQuery["kind"]) => number;
}

export function createFakeGitHub(options: FakeGitHubOptions = {}): FakeGitHub {
  const requests: GitHubQuery[] = [];

  const refuse = (key: string) => {
    const failure = options.failures?.[key];
    if (failure) throw failure;
  };

  const client: GitHubClient = {
    probe: vi.fn(async (): Promise<GitHubProbe> => {
      refuse("github.probe");
      return {
        // Not a GitHub repository, unless a test says otherwise.
        availability: "unsupported",
        repository: null,
        detail: "This folder has no GitHub repository.",
        ...options.probe,
      };
    }),

    query: vi.fn(async (request: GitHubQuery): Promise<GitHubResponse> => {
      requests.push(request);
      refuse(`github.${request.kind}`);
      switch (request.kind) {
        case "runs":
          return { kind: "runs", detail: options.runs ?? [] };
        case "runJobs":
          return { kind: "jobs", detail: options.jobs ?? [] };
        case "pullRequests":
          return { kind: "pullRequests", detail: options.pulls ?? [] };
        case "pullRequest": {
          const found = (options.pulls ?? []).find(
            (pull) => pull.number === request.detail.number,
          );
          return {
            kind: "pullRequest",
            detail: found ?? makePull(request.detail.number),
          };
        }
        case "issues":
          return { kind: "issues", detail: options.issues ?? [] };
        case "reviewComments":
          return {
            kind: "reviewThreads",
            detail: options.reviewThreads ?? [],
          };
        case "replyToReviewComment": {
          // Answers with the thread as it now stands, the way the real
          // transport does - it re-reads rather than appending the new
          // comment to a list the caller already held.
          const threads = options.reviewThreads ?? [];
          const found = threads.find(
            (thread) => thread.id === request.detail.commentId,
          );
          return {
            kind: "reviewThread",
            detail: found ?? makeThread(request.detail.commentId),
          };
        }
        case "createPullRequest":
          return {
            kind: "created",
            detail: options.createdPullRequest ?? {
              url: "https://github.com/o/r/pull/99",
              number: 99,
            },
          };
        case "browseUrl":
          return {
            kind: "url",
            detail:
              options.browseUrl ??
              `https://github.com/o/r/blob/main/${request.detail.path}${
                request.detail.line === null ? "" : `#L${request.detail.line}`
              }`,
          };
      }
    }),
  };

  return {
    client,
    requests,
    countOf: (kind) => requests.filter((request) => request.kind === kind).length,
  };
}
