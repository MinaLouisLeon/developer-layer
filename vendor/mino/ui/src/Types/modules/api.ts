/**
 * Every transport request and response type in the app.
 *
 * Project rule mapped to this repo: the Next.js rule puts API types in
 * `src/Types/modules/api.ts` behind `src/Types/index.ts`. This app has no HTTP
 * API - the transport IS the API - so the transport's request/response shapes
 * and its client interface live here, and nothing declares them inline in a
 * hook or a component.
 *
 * The domain types themselves are generated from Rust (`./generated`), never
 * hand-written, so the two sides cannot drift.
 *
 * Git and GitHub are the two surfaces not declared here. Each is a separate
 * trait in Rust (`GitTransport`, `GitHubTransport`), so each is a separate
 * module here - see `./git` and `./github` - and `@/Types` re-exports all of
 * them so it stays the one import path.
 */
import type {
  ConnectionInfo,
  ConnectionTarget,
  DirEntry,
  FilePayload,
  PtyEvent,
  PtySession,
  PtySessionId,
  PtySize,
  PtySpawnSpec,
  ReadFileOptions,
  SearchHits,
  SearchQuery,
  ShellProbe,
  StructuredOutput,
  StructuredRequest,
  WriteRequest,
  TransportKind,
} from "../generated";
import type { GitClient, GitCommand } from "./git";
import type { GitBranchCommand } from "./git-branches";
import type { GitHistoryCommand } from "./git-history";
import type { GitRemoteCommand } from "./git-remote";
import type { GitStashCommand } from "./git-stash";
import type { GitHubClient, GitHubCommand } from "./github";

/** Tauri command names. The only place these strings are written down. */
export const TRANSPORT_COMMANDS = {
  connect: "connect",
  disconnect: "disconnect",
  listDir: "list_dir",
  stat: "stat",
  searchFiles: "search_files",
  readFile: "read_file",
  writeFile: "write_file",
  openPty: "open_pty",
  writePty: "write_pty",
  resizePty: "resize_pty",
  closePty: "close_pty",
  runStructured: "run_structured",
  probeShell: "probe_shell",
} as const;

/**
 * Every Tauri command name, every surface's worth. `invokeTransport` takes
 * this, so a command that is not on one of the maps cannot be invoked at all.
 */
export type TransportCommand =
  | (typeof TRANSPORT_COMMANDS)[keyof typeof TRANSPORT_COMMANDS]
  | GitBranchCommand
  | GitCommand
  | GitHistoryCommand
  | GitStashCommand
  | GitRemoteCommand
  | GitHubCommand;

/** Command argument payloads, one per command that takes arguments. */
export type ConnectArgs = { target: ConnectionTarget };
export type PathArgs = { path: string };
export type ReadFileArgs = PathArgs & { options: ReadFileOptions };
export type WriteFileArgs = PathArgs & { request: WriteRequest };
export type OpenPtyArgs = { spec: PtySpawnSpec };
export type PtyIdArgs = { id: PtySessionId };
export type WritePtyArgs = PtyIdArgs & { data: string };
export type ResizePtyArgs = PtyIdArgs & { size: PtySize };
export type RunStructuredArgs = { request: StructuredRequest };
export type SearchFilesArgs = { query: SearchQuery };

export type PtyEventHandler = (event: PtyEvent) => void;
/** Returned by `onPtyEvent`; calling it detaches the listener. */
export type Unsubscribe = () => void;

/**
 * Mirrors `mino_core::transport::Transport` method for method.
 *
 * One deviation, forced by the IPC boundary: Rust's `open_pty` returns the
 * session descriptor plus a channel, while here `openPty` returns the
 * descriptor and the stream arrives through `onPtyEvent`.
 *
 * Panes are written against this interface only, so the same components serve
 * the Tauri build today and the browser + agent build later.
 */
export interface TransportClient {
  readonly kind: TransportKind;
  connect(target: ConnectionTarget): Promise<ConnectionInfo>;
  disconnect(): Promise<void>;
  listDir(path: string): Promise<DirEntry[]>;
  stat(path: string): Promise<DirEntry>;

  /**
   * Walks the connected root for names matching `query.query`, ranked.
   *
   * The counterpart to `listDir`'s single level, and the only call that
   * descends. Bounded rather than exhaustive - by a result limit, an entry cap
   * and a deadline, all enforced in Rust - and `SearchHits.truncated` says so
   * when the answer is partial.
   */
  searchFiles(query: SearchQuery): Promise<SearchHits>;
  readFile(path: string, options?: ReadFileOptions): Promise<FilePayload>;

  /**
   * Saves a file and returns the entry as it now stands.
   *
   * The only write in the app. Subject to the same path guard as every read,
   * and refuses to overwrite a file that changed since `request` was built -
   * see `WriteRequest.expectedModifiedMs`.
   */
  writeFile(path: string, request: WriteRequest): Promise<DirEntry>;
  openPty(spec: PtySpawnSpec): Promise<PtySession>;
  writePty(id: PtySessionId, data: string): Promise<void>;
  resizePty(id: PtySessionId, size: PtySize): Promise<void>;
  closePty(id: PtySessionId): Promise<void>;
  runStructured(request: StructuredRequest): Promise<StructuredOutput>;
  probeShell(): Promise<ShellProbe>;
  onPtyEvent(id: PtySessionId, handler: PtyEventHandler): Promise<Unsubscribe>;

  /**
   * The git surface. Always present on the client, because whether *this*
   * target has git is a question Rust answers - a client that hid the property
   * would be guessing before it had asked.
   */
  readonly git: GitClient;

  /**
   * The GitHub surface, present on the same terms and for the same reason.
   * Whether there is a GitHub repository here has four answers rather than
   * two, and all four come from `github.probe()` - a client that hid the
   * property would be answering one of them before it had asked.
   */
  readonly github: GitHubClient;
}
