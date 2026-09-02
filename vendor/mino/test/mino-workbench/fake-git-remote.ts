import { vi } from "vitest";

import type {
  ConflictResolution,
  GitConflict,
  GitConflictClient,
  GitFetchResult,
  GitPullOutcome,
  GitPullResult,
  GitPushOutcome,
  GitPushResult,
  GitRemote,
  GitRemoteClient,
  PullRequest,
  PushRequest,
  TransportError,
} from "@/Types";

import { makeRemote } from "./fake-git-remote-rows";

/**
 * The fake remote and conflict surfaces, beside the other git fakes so no file
 * grows past the project's ceiling.
 *
 * Everything defaults to the quiet answer: one remote, nothing to bring down,
 * nothing conflicted. That is the shape every pane has to survive unchanged,
 * and it is also the honest default - most of the time a fetch finds nothing
 * and most repositories are not mid-merge.
 *
 * The mutating half **records what it was asked for** rather than pretending
 * to do it. What git would actually do is asserted in Rust against real
 * repositories; what the panel sends - and, for the push, whether it sent
 * anything at all before the reader confirmed - is what these tests are about.
 */
export interface FakeGitRemoteOptions {
  remotes?: GitRemote[];
  conflicts?: GitConflict[];
  /** What `pull()` reports. Defaults to nothing to bring down. */
  pullOutcome?: GitPullOutcome;
  /** What `push()` reports. Defaults to a normal push. */
  pushOutcome?: GitPushOutcome;
  /** Git's own words on a result, already redacted by the time a UI sees it. */
  summary?: string;
  /** Keyed by method name (`git.pull`, `git.push`, `git.resolve`, …). */
  failures?: Record<string, TransportError>;
}

export interface FakeGitRemote {
  client: GitRemoteClient & GitConflictClient;
  /** Every push that actually reached the transport, in order. */
  pushes: PushRequest[];
  /** Every pull, likewise. */
  pulls: PullRequest[];
  /** Every resolution, as `[path, resolution]`. */
  resolutions: [string, ConflictResolution][];
}

export function createFakeGitRemote(
  options: FakeGitRemoteOptions = {},
): FakeGitRemote {
  const pushes: PushRequest[] = [];
  const pulls: PullRequest[] = [];
  const resolutions: [string, ConflictResolution][] = [];

  const refuse = (key: string) => {
    const failure = options.failures?.[key];
    if (failure) throw failure;
  };
  const summary = options.summary ?? null;

  const client: GitRemoteClient & GitConflictClient = {
    remotes: vi.fn(async (): Promise<GitRemote[]> => {
      refuse("git.remotes");
      return options.remotes ?? [makeRemote()];
    }),

    fetch: vi.fn(async (remote: string | null): Promise<GitFetchResult> => {
      refuse("git.fetch");
      return { remote: remote ?? "origin", summary };
    }),

    pull: vi.fn(async (request: PullRequest): Promise<GitPullResult> => {
      pulls.push(request);
      refuse("git.pull");
      return {
        remote: request.remote ?? "origin",
        outcome: options.pullOutcome ?? "alreadyUpToDate",
        summary,
      };
    }),

    push: vi.fn(async (request: PushRequest): Promise<GitPushResult> => {
      // Recorded *before* the refusal, so a test can assert that a rejected
      // push was actually attempted - and, more importantly, that an
      // unconfirmed one was not.
      pushes.push(request);
      refuse("git.push");
      return {
        remote: request.remote ?? "origin",
        branch: request.branch ?? "main",
        outcome: options.pushOutcome ?? "pushed",
        summary,
        forced: request.force,
      };
    }),

    conflicts: vi.fn(async (): Promise<GitConflict[]> => {
      refuse("git.conflicts");
      return options.conflicts ?? [];
    }),

    resolve: vi.fn(async (path: string, resolution: ConflictResolution) => {
      resolutions.push([path, resolution]);
      refuse("git.resolve");
    }),
  };

  return { client, pushes, pulls, resolutions };
}
