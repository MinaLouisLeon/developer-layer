import { vi } from "vitest";

import type {
  DiffRequest,
  GitBlame,
  GitCommitDetail,
  GitDiff,
  GitDiffLine,
  GitFileDiff,
  GitHistoryClient,
  GitHunk,
  GitLog,
  LogRequest,
  TransportError,
} from "@/Types";

/**
 * The fake history surface, beside `fake-git.ts` so neither file grows past
 * the project's ceiling.
 *
 * Everything defaults to *nothing to show* - an empty diff, no history, no
 * blame - because that is the shape a pane has to survive unchanged. A test
 * that wants history says so.
 */
export interface FakeGitHistoryOptions {
  diff?: Partial<GitDiff>;
  log?: Partial<GitLog>;
  detail?: GitCommitDetail;
  blame?: Partial<GitBlame>;
  failures?: Record<string, TransportError>;
}

export const EMPTY_DIFF: GitDiff = { files: [], truncated: false };

/** One hunk's worth of a plain edit, with the line numbers already worked out. */
export function makeHunk(overrides: Partial<GitHunk> = {}): GitHunk {
  const lines: GitDiffLine[] = [
    line("context", "unchanged", 1, 1),
    line("removed", "was here", 2, null),
    line("added", "is here now", null, 2),
  ];
  return {
    oldStart: 1,
    oldLines: 2,
    newStart: 1,
    newLines: 2,
    header: "",
    lines,
    ...overrides,
  };
}

export function line(
  kind: GitDiffLine["kind"],
  content: string,
  oldLine: number | null,
  newLine: number | null,
): GitDiffLine {
  return { kind, content, oldLine, newLine, noNewline: false };
}

export function makeFileDiff(
  relativePath: string,
  overrides: Partial<GitFileDiff> = {},
): GitFileDiff {
  return {
    relativePath,
    oldPath: null,
    binary: false,
    hunks: [makeHunk()],
    ...overrides,
  };
}

export function createFakeGitHistory(
  options: FakeGitHistoryOptions = {},
): GitHistoryClient {
  const refuse = (key: string) => {
    const failure = options.failures?.[key];
    if (failure) throw failure;
  };

  return {
    diff: vi.fn(async (_request: DiffRequest): Promise<GitDiff> => {
      refuse("git.diff");
      return { ...EMPTY_DIFF, ...options.diff };
    }),
    log: vi.fn(async (_request: LogRequest): Promise<GitLog> => {
      refuse("git.log");
      return { commits: [], truncated: false, ...options.log };
    }),
    show: vi.fn(async (revision: string): Promise<GitCommitDetail> => {
      refuse("git.show");
      if (!options.detail) {
        throw {
          kind: "invalidArgument",
          detail: { message: `no commit ${revision} in this fake` },
        } as TransportError;
      }
      return options.detail;
    }),
    commitDiff: vi.fn(async (): Promise<GitDiff> => {
      refuse("git.commitDiff");
      return { ...EMPTY_DIFF, ...options.diff };
    }),
    blame: vi.fn(async (path: string): Promise<GitBlame> => {
      refuse("git.blame");
      return {
        relativePath: path,
        lines: [],
        truncated: false,
        ...options.blame,
      };
    }),
  };
}
