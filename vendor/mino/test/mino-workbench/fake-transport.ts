import { vi } from "vitest";

import type {
  ConnectionInfo,
  ConnectionTarget,
  FilePayload,
  PtyEvent,
  PtyEventHandler,
  PtySession,
  PtySessionId,
  SearchHits,
  SearchQuery,
  StructuredOutput,
  TransportClient,
  TransportError,
  WriteRequest,
} from "@/Types";

import { makeEntry } from "./fake-entries";
import { createFakeGitSurface } from "./fake-git";
import { createFakeGitHub } from "./fake-github";
import { searchFiles } from "./fake-search";
import type { FakeTransportOptions } from "./fake-options";
import { NU_PRESENT_PROBE } from "./fake-shell";

export type { FakeTransportOptions } from "./fake-options";

// One line per fixture module: every test imports its rows from here.
export * from "./fake-git-rows";
export * from "./fake-git-remote-rows";
export * from "./fake-github-rows";
export { EMPTY_DIFF, line, makeFileDiff, makeHunk } from "./fake-git-history";
export { makeBranch, makeStash } from "./fake-git-refs";
// Imported above as well: `writeFile` builds its answer with it, and a bare
// re-export would leave the name unbound inside this module.
export { makeEntry };

/**
 * The primary test seam: a fake implementation of the same interface the panes
 * are written against. If a pane cannot be tested through this, it is reaching
 * past the transport and the source is wrong.
 */
export function createFakeTransport(options: FakeTransportOptions = {}) {
  const listeners = new Map<PtySessionId, PtyEventHandler>();
  /** What `writeFile` was handed, by path. */
  const saved = new Map<string, string>();
  const session: PtySession = {
    id: "session-1",
    program: "/usr/bin/nu",
    shell: "nu",
    cwd: "/root",
    size: { cols: 80, rows: 24 },
    fellBack: false,
    ...options.session,
  };

  const fail = (key: string) => {
    const failure = options.failures?.[key];
    if (failure) return Promise.reject(failure);
    return null;
  };

  // Built first so its request log can be returned beside the client: half of
  // what the GitHub tests assert is what was asked for, and when.
  const github = createFakeGitHub(options);
  const git = createFakeGitSurface(options);

  const client: TransportClient = {
    kind: "local",
    // Echoes the target it was handed rather than answering "local" to
    // everything: which transport a session is on changes how panes behave -
    // the folder picker is the clearest case - so a test has to be able to
    // open a remote one.
    connect: vi.fn(async (target: ConnectionTarget): Promise<ConnectionInfo> => {
      const failure = await fail("connect");
      if (failure) return failure;
      const root = target.detail.root ?? "/root";
      const name = root.split(/[\\/]/).filter(Boolean).pop() ?? root;
      return { id: "connection-1", kind: target.kind, root, label: `${name} (${target.kind})` };
    }),
    disconnect: vi.fn(async () => undefined),
    listDir: vi.fn(async (path: string) => {
      const failure = options.failures?.[`listDir:${path}`];
      if (failure) throw failure;
      return options.listings?.[path] ?? [];
    }),
    stat: vi.fn(async (path: string) => makeEntry(path)),
    searchFiles: vi.fn(
      (query: SearchQuery): Promise<SearchHits> =>
        searchFiles(options.searchable ?? [], query, options.failures?.searchFiles),
    ),
    // Records what was saved so a test can assert the content, and honours
    // the same conflict guard the real transports apply.
    writeFile: vi.fn(async (path: string, request: WriteRequest) => {
      const failure = options.failures?.[`writeFile:${path}`];
      if (failure) throw failure;
      const existing = options.files?.[path];
      saved.set(path, request.content);
      return makeEntry(path, {
        size: request.content.length,
        modifiedMs: (existing?.size ?? 0) + 1,
      });
    }),
    readFile: vi.fn(async (path: string): Promise<FilePayload> => {
      const failure = options.failures?.[`readFile:${path}`];
      if (failure) throw failure;
      const payload = options.files?.[path];
      if (!payload) throw { kind: "notFound", detail: { path } } as TransportError;
      return payload;
    }),
    openPty: vi.fn(async () => session),
    writePty: vi.fn(async () => undefined),
    resizePty: vi.fn(async () => undefined),
    closePty: vi.fn(async () => undefined),
    runStructured: vi.fn(
      async (): Promise<StructuredOutput> =>
        options.structured ?? { value: [], stderr: "" },
    ),
    probeShell: vi.fn(async () => options.shellProbe ?? NU_PRESENT_PROBE),
    git: git.client,
    github: github.client,
    onPtyEvent: vi.fn(async (id: PtySessionId, handler: PtyEventHandler) => {
      listeners.set(id, handler);
      return () => listeners.delete(id);
    }),
  };

  /** Pushes an event as the real transport would. */
  const emit = (event: PtyEvent, id: PtySessionId = session.id) =>
    listeners.get(id)?.(event);

  return {
    client,
    emit,
    session,
    listenerCount: () => listeners.size,
    /** What `writeFile` was handed, by path. */
    saved,
    // What the mutating calls were *asked for*. Half of what phases 5 and 6
    // assert is here rather than in the rendering: an unconfirmed push and a
    // collapsed section that fetched are both invisible to a DOM query.
    githubRequests: github.requests,
    countGitHub: github.countOf,
    pushes: git.remote.pushes,
    pulls: git.remote.pulls,
    resolutions: git.remote.resolutions,
  };
}
