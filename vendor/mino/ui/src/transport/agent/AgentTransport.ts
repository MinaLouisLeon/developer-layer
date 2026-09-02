import type {
  ConnectionInfo,
  ConnectionTarget,
  DirEntry,
  FilePayload,
  GitClient,
  GitHubClient,
  PtyEventHandler,
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
  TransportClient,
  TransportError,
  TransportKind,
  Unsubscribe,
} from "@/Types";

import { AgentGitClient } from "./AgentGitClient";
import { AgentGitHubClient } from "./AgentGitHubClient";

/**
 * The browser transport: talks to a `mino-agent` daemon over WebSocket.
 *
 * Declared, not built. Every method rejects with the same typed
 * `Unimplemented` error the Rust side returns, so the panes can be pointed at
 * it today and will behave identically once the socket lands. The frame schema
 * it will speak is already written down in
 * crates/mino-agent/src/protocol.rs.
 */
export class AgentTransport implements TransportClient {
  readonly kind: TransportKind = "remoteAgent";
  readonly git: GitClient = new AgentGitClient();
  readonly github: GitHubClient = new AgentGitHubClient();

  constructor(private readonly url: string) {}

  /** The agent this client would dial. Read by the connection screen. */
  get endpoint(): string {
    return this.url;
  }

  private reject<T>(feature: string): Promise<T> {
    const error: TransportError = {
      kind: "unimplemented",
      detail: { feature, transport: "remoteAgent" },
    };
    return Promise.reject(error);
  }

  connect(_target: ConnectionTarget): Promise<ConnectionInfo> {
    return this.reject("connect");
  }

  disconnect(): Promise<void> {
    return this.reject("disconnect");
  }

  listDir(_path: string): Promise<DirEntry[]> {
    return this.reject("list_dir");
  }

  stat(_path: string): Promise<DirEntry> {
    return this.reject("stat");
  }

  searchFiles(_query: SearchQuery): Promise<SearchHits> {
    return this.reject("search_files");
  }

  readFile(_path: string, _options?: ReadFileOptions): Promise<FilePayload> {
    return this.reject("read_file");
  }

  writeFile(_path: string, _request: WriteRequest): Promise<DirEntry> {
    return this.reject("write_file");
  }

  openPty(_spec: PtySpawnSpec): Promise<PtySession> {
    return this.reject("open_pty");
  }

  writePty(_id: PtySessionId, _data: string): Promise<void> {
    return this.reject("write_pty");
  }

  resizePty(_id: PtySessionId, _size: PtySize): Promise<void> {
    return this.reject("resize_pty");
  }

  closePty(_id: PtySessionId): Promise<void> {
    return this.reject("close_pty");
  }

  runStructured(_request: StructuredRequest): Promise<StructuredOutput> {
    return this.reject("run_structured");
  }

  probeShell(): Promise<ShellProbe> {
    return this.reject("probe_shell");
  }

  onPtyEvent(
    _id: PtySessionId,
    _handler: PtyEventHandler,
  ): Promise<Unsubscribe> {
    return this.reject("on_pty_event");
  }
}
