import type {
  ConflictResolution,
  GitConflict,
  GitConflictClient,
  GitFetchResult,
  GitPullResult,
  GitPushResult,
  GitRemote,
  GitRemoteClient,
  PullRequest,
  PushRequest,
  TransportError,
} from "@/Types";
import { GIT_REMOTE_COMMANDS } from "@/Types";

/**
 * The browser remote and conflict surfaces: declared, not built.
 *
 * Extended by `AgentGitClient`, which is how the browser client is assembled
 * the same way the desktop one is.
 *
 * Two of these rejections are worth a sentence each, because on this surface
 * an unbuilt method and a real answer look alike:
 *
 * - **`push`** rejects with `unimplemented`, which must not read as a push the
 *   remote refused. Only one of those is something the reader can act on.
 * - **`conflicts`** does *not* resolve an empty array. "No agent protocol yet"
 *   and "nothing is conflicted" render identically - a quiet section - and
 *   only one of them is a bug waiting to be finished.
 *
 * And there is no credential here, because there is nowhere on this surface
 * for one: see `plan/decisions.md` D3.
 */
export class AgentGitRemoteClient implements GitRemoteClient, GitConflictClient {
  protected reject<T>(feature: string): Promise<T> {
    const error: TransportError = {
      kind: "unimplemented",
      detail: { feature, transport: "remoteAgent" },
    };
    return Promise.reject(error);
  }

  remotes(): Promise<GitRemote[]> {
    return this.reject(GIT_REMOTE_COMMANDS.remotes);
  }

  fetch(_remote: string | null): Promise<GitFetchResult> {
    return this.reject(GIT_REMOTE_COMMANDS.fetch);
  }

  pull(_request: PullRequest): Promise<GitPullResult> {
    return this.reject(GIT_REMOTE_COMMANDS.pull);
  }

  push(_request: PushRequest): Promise<GitPushResult> {
    return this.reject(GIT_REMOTE_COMMANDS.push);
  }

  conflicts(): Promise<GitConflict[]> {
    return this.reject(GIT_REMOTE_COMMANDS.conflicts);
  }

  resolve(_path: string, _resolution: ConflictResolution): Promise<void> {
    return this.reject(GIT_REMOTE_COMMANDS.resolve);
  }
}
