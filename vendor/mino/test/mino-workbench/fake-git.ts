import { vi } from "vitest";

import type { FakeGitHistoryOptions } from "./fake-git-history";
import { createFakeGitHistory } from "./fake-git-history";
import type { FakeGitRefsOptions } from "./fake-git-refs";
import { createFakeGitRefs } from "./fake-git-refs";
import type { FakeGitRemoteOptions } from "./fake-git-remote";
import { createFakeGitRemote } from "./fake-git-remote";

import type {
  CommitRequest,
  GitClient,
  GitCommit,
  GitRepository,
  GitStatus,
  TransportError,
} from "@/Types";

import { LANDED_COMMIT } from "./fake-git-rows";

/**
 * The fake git surface, kept beside the fake transport rather than in it so
 * neither file grows past the project's ceiling - the same arrangement
 * `fake-search.ts` and `fake-shell.ts` already use.
 */

export interface FakeGitOptions
  extends FakeGitHistoryOptions,
    FakeGitRefsOptions,
    FakeGitRemoteOptions {
  /**
   * What `repository()` answers. `undefined` means "not a repository", which
   * is the default because most folders are not one - a fake that was a
   * checkout by default would let a pane depend on git without saying so.
   */
  repository?: GitRepository;
  /** What `status()` answers. Ignored when `repository` is unset. */
  status?: Partial<GitStatus>;
  /** Keyed by method name (`git.status`, `git.commit`, `git.diff`, …). */
  failures?: Record<string, TransportError>;
  /** What `commit()` resolves with when it is not made to fail. */
  commit?: Partial<GitCommit>;
}

export function createFakeGit(options: FakeGitOptions = {}): GitClient {
  return createFakeGitSurface(options).client;
}

/**
 * The same, with the record of what the mutating remote calls were asked for.
 *
 * `createFakeGit` is the shape every existing test uses and stays that shape;
 * this is what `createFakeTransport` reaches for so a test can assert that an
 * unconfirmed push never happened.
 */
export function createFakeGitSurface(options: FakeGitOptions = {}): {
  client: GitClient;
  remote: ReturnType<typeof createFakeGitRemote>;
} {
  const repository = options.repository ?? null;
  const remote = createFakeGitRemote(options);

  /** Throws the failure a test configured for `key`, if there is one. */
  const refuse = (key: string) => {
    const failure = options.failures?.[key];
    if (failure) throw failure;
  };

  const client: GitClient = {
    // The reading half of history, which defaults to nothing to show.
    ...createFakeGitHistory(options),
    // Branches and the stash, which default to nothing there.
    ...createFakeGitRefs(options),
    // Remotes and conflicts, which default to one remote and nothing
    // conflicted - the honest quiet answer for both.
    ...remote.client,

    repository: vi.fn(async () => {
      refuse("git.repository");
      return repository;
    }),
    status: vi.fn(async (): Promise<GitStatus> => {
      refuse("git.status");
      // The real transports raise this rather than inventing an empty status,
      // because a caller reaching `status` without asking `repository` first
      // has made a mistake worth reporting.
      if (!repository) {
        throw {
          kind: "invalidArgument",
          detail: {
            message: "the connected folder is not inside a git repository",
          },
        } as TransportError;
      }
      return { repository, entries: [], truncated: false, ...options.status };
    }),

    // The mutating half records what it was asked for and nothing else. What
    // git would *do* is asserted in Rust against real repositories; what the
    // panel asks for is what these tests are about.
    stage: vi.fn(async (_paths: string[]) => {
      refuse("git.stage");
    }),
    unstage: vi.fn(async (_paths: string[]) => {
      refuse("git.unstage");
    }),
    discard: vi.fn(async (_paths: string[]) => {
      refuse("git.discard");
    }),
    commit: vi.fn(async (request: CommitRequest): Promise<GitCommit> => {
      refuse("git.commit");
      const [firstLine] = request.message.split("\n");
      return {
        ...LANDED_COMMIT,
        summary: firstLine || LANDED_COMMIT.summary,
        ...options.commit,
      };
    }),
  };
  return { client, remote };
}
