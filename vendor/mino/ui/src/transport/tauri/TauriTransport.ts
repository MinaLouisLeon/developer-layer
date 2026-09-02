import { listen } from "@tauri-apps/api/event";

import type {
  ConnectArgs,
  ConnectionInfo,
  ConnectionTarget,
  DirEntry,
  FilePayload,
  GitClient,
  GitHubClient,
  OpenPtyArgs,
  PathArgs,
  PtyEvent,
  PtyEventHandler,
  PtySession,
  PtySessionId,
  PtySize,
  PtySpawnSpec,
  PtyIdArgs,
  ReadFileArgs,
  WriteFileArgs,
  ReadFileOptions,
  ResizePtyArgs,
  RunStructuredArgs,
  SearchFilesArgs,
  SearchHits,
  SearchQuery,
  ShellProbe,
  StructuredOutput,
  StructuredRequest,
  WriteRequest,
  TransportClient,
  TransportKind,
  Unsubscribe,
  WritePtyArgs,
} from "@/Types";
import { TRANSPORT_COMMANDS } from "@/Types";

import { invokeTransport } from "./invoke";
import { TauriGitClient } from "./TauriGitClient";
import { TauriGitHubClient } from "./TauriGitHubClient";

const DEFAULT_READ_OPTIONS: ReadFileOptions = {
  maxBytes: null,
  allowBinary: false,
};

/** Matches `event_name` in apps/desktop/src-tauri/src/commands/pty.rs. */
function ptyChannel(id: PtySessionId): string {
  return `pty://${id}`;
}

/**
 * The desktop transport: one method per Tauri command, no logic of its own.
 * Which Rust implementation actually serves a call is decided by the target
 * passed to `connect`, in Rust, not here.
 */
export class TauriTransport implements TransportClient {
  readonly kind: TransportKind = "local";
  readonly git: GitClient = new TauriGitClient();
  readonly github: GitHubClient = new TauriGitHubClient();

  connect(target: ConnectionTarget): Promise<ConnectionInfo> {
    return invokeTransport(TRANSPORT_COMMANDS.connect, {
      target,
    } satisfies ConnectArgs);
  }

  disconnect(): Promise<void> {
    return invokeTransport(TRANSPORT_COMMANDS.disconnect);
  }

  listDir(path: string): Promise<DirEntry[]> {
    return invokeTransport(TRANSPORT_COMMANDS.listDir, {
      path,
    } satisfies PathArgs);
  }

  stat(path: string): Promise<DirEntry> {
    return invokeTransport(TRANSPORT_COMMANDS.stat, { path } satisfies PathArgs);
  }

  searchFiles(query: SearchQuery): Promise<SearchHits> {
    return invokeTransport(TRANSPORT_COMMANDS.searchFiles, {
      query,
    } satisfies SearchFilesArgs);
  }

  readFile(path: string, options = DEFAULT_READ_OPTIONS): Promise<FilePayload> {
    return invokeTransport(TRANSPORT_COMMANDS.readFile, {
      path,
      options,
    } satisfies ReadFileArgs);
  }

  writeFile(path: string, request: WriteRequest): Promise<DirEntry> {
    return invokeTransport(TRANSPORT_COMMANDS.writeFile, {
      path,
      request,
    } satisfies WriteFileArgs);
  }

  openPty(spec: PtySpawnSpec): Promise<PtySession> {
    return invokeTransport(TRANSPORT_COMMANDS.openPty, {
      spec,
    } satisfies OpenPtyArgs);
  }

  writePty(id: PtySessionId, data: string): Promise<void> {
    return invokeTransport(TRANSPORT_COMMANDS.writePty, {
      id,
      data,
    } satisfies WritePtyArgs);
  }

  resizePty(id: PtySessionId, size: PtySize): Promise<void> {
    return invokeTransport(TRANSPORT_COMMANDS.resizePty, {
      id,
      size,
    } satisfies ResizePtyArgs);
  }

  closePty(id: PtySessionId): Promise<void> {
    return invokeTransport(TRANSPORT_COMMANDS.closePty, { id } satisfies PtyIdArgs);
  }

  runStructured(request: StructuredRequest): Promise<StructuredOutput> {
    return invokeTransport(TRANSPORT_COMMANDS.runStructured, {
      request,
    } satisfies RunStructuredArgs);
  }

  probeShell(): Promise<ShellProbe> {
    return invokeTransport(TRANSPORT_COMMANDS.probeShell);
  }

  async onPtyEvent(
    id: PtySessionId,
    handler: PtyEventHandler,
  ): Promise<Unsubscribe> {
    return listen<PtyEvent>(ptyChannel(id), (event) => handler(event.payload));
  }
}
