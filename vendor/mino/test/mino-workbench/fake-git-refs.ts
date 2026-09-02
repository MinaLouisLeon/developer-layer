import { vi } from "vitest";

import type {
  CreateBranchRequest,
  GitBranch,
  GitBranchClient,
  GitStash,
  GitStashClient,
  StashRequest,
  TransportError,
} from "@/Types";

/**
 * The fake branch and stash surfaces, beside `fake-git.ts` so neither file
 * grows past the project's ceiling - the arrangement `fake-git-history.ts`
 * already uses.
 *
 * Everything defaults to *nothing there*: no branches, an empty stack. That is
 * the shape a pane has to survive unchanged, and a fake that had branches by
 * default would let a pane depend on them without saying so.
 *
 * The mutating half records what it was asked for and nothing else. What git
 * would *do* is asserted in Rust against real repositories; what the panel
 * asks for, and what it does with the answer, is what these tests are about.
 */
export interface FakeGitRefsOptions {
  branches?: GitBranch[];
  stashes?: GitStash[];
  /** Keyed by method name (`git.checkout`, `git.stashDrop`, …). */
  failures?: Record<string, TransportError>;
  /** What `createBranch` resolves with, when a test needs a specific answer. */
  created?: GitBranch;
}

/** A local branch on `main`, checked out, tracking `origin/main` and in step. */
export function makeBranch(
  name: string,
  overrides: Partial<GitBranch> = {},
): GitBranch {
  return {
    name,
    isHead: false,
    isRemote: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    lastCommit: null,
    ...overrides,
  };
}

export function makeStash(
  index: number,
  overrides: Partial<GitStash> = {},
): GitStash {
  return {
    index,
    message: `a stash at ${index}`,
    branch: "main",
    timestampMs: 1_788_024_729_000,
    ...overrides,
  };
}

export function createFakeGitRefs(
  options: FakeGitRefsOptions = {},
): GitBranchClient & GitStashClient {
  const refuse = (key: string) => {
    const failure = options.failures?.[key];
    if (failure) throw failure;
  };

  return {
    branches: vi.fn(async (): Promise<GitBranch[]> => {
      refuse("git.branches");
      return options.branches ?? [];
    }),
    checkout: vi.fn(async (_name: string) => {
      refuse("git.checkout");
    }),
    createBranch: vi.fn(async (request: CreateBranchRequest) => {
      refuse("git.createBranch");
      return options.created ?? makeBranch(request.name, { isHead: true });
    }),
    deleteBranch: vi.fn(async (_name: string, _force: boolean) => {
      refuse("git.deleteBranch");
    }),

    stashList: vi.fn(async (): Promise<GitStash[]> => {
      refuse("git.stashList");
      return options.stashes ?? [];
    }),
    stashPush: vi.fn(async (_request: StashRequest) => {
      refuse("git.stashPush");
    }),
    stashApply: vi.fn(async (_index: number, _pop: boolean) => {
      refuse("git.stashApply");
    }),
    stashDrop: vi.fn(async (_index: number) => {
      refuse("git.stashDrop");
    }),
  };
}
