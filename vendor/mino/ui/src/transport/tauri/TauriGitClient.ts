import type {
  CommitRequest,
  GitClient,
  GitCommit,
  GitCommitArgs,
  GitPathsArgs,
  GitRepository,
  GitStatus,
} from "@/Types";
import { GIT_COMMANDS } from "@/Types";

import { invokeTransport } from "./invoke";
import { TauriGitRemoteClient } from "./TauriGitRemoteClient";

/**
 * The desktop git surface: one method per Tauri command, no logic of its own.
 *
 * A separate class rather than six more methods on `TauriTransport`, mirroring
 * the Rust split - `Transport::git()` returns a second trait, and this is what
 * that looks like on the other side of the IPC boundary.
 *
 * It inherits the history, branch, stash, remote and conflict surfaces
 * through `TauriGitRemoteClient`, so `client.git` is one object even though
 * the interface is written in five files.
 *
 * Note what is *not* here: no confirmation, no path checking, no ordering.
 * Confirming a discard is the panel's job and guarding a path is Rust's, and
 * putting either here would be a second place to keep them right.
 */
export class TauriGitClient extends TauriGitRemoteClient implements GitClient {
  repository(): Promise<GitRepository | null> {
    return invokeTransport(GIT_COMMANDS.repository);
  }

  status(): Promise<GitStatus> {
    return invokeTransport(GIT_COMMANDS.status);
  }

  stage(paths: string[]): Promise<void> {
    return invokeTransport(GIT_COMMANDS.stage, { paths } satisfies GitPathsArgs);
  }

  unstage(paths: string[]): Promise<void> {
    return invokeTransport(GIT_COMMANDS.unstage, {
      paths,
    } satisfies GitPathsArgs);
  }

  discard(paths: string[]): Promise<void> {
    return invokeTransport(GIT_COMMANDS.discard, {
      paths,
    } satisfies GitPathsArgs);
  }

  commit(request: CommitRequest): Promise<GitCommit> {
    return invokeTransport(GIT_COMMANDS.commit, {
      request,
    } satisfies GitCommitArgs);
  }
}
