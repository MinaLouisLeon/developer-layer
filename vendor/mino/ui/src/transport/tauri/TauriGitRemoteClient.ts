import type {
  ConflictResolution,
  GitConflict,
  GitConflictClient,
  GitFetchArgs,
  GitFetchResult,
  GitPullArgs,
  GitPullResult,
  GitPushArgs,
  GitPushResult,
  GitRemote,
  GitRemoteClient,
  GitResolveArgs,
  PullRequest,
  PushRequest,
} from "@/Types";
import { GIT_REMOTE_COMMANDS } from "@/Types";

import { invokeTransport } from "./invoke";
import { TauriGitRefsClient } from "./TauriGitRefsClient";

/**
 * The desktop remote and conflict surfaces: one method per Tauri command, no
 * logic of its own.
 *
 * It extends the branch and stash client and is extended by `TauriGitClient`,
 * which is how five interfaces become one object across a language with single
 * inheritance.
 *
 * Note what is *not* here, because on this surface it matters more than
 * anywhere else in the app. No confirmation before a push, no separate
 * treatment of a force push, no dirty-tree check before a pull, and no refresh
 * afterwards. The confirmations are the panel's, the dirty-tree check is
 * Rust's - where both transports get it - and putting either here would be a
 * second place to keep them right.
 *
 * And no credential. There is nowhere on this client to put one, which is the
 * point: see `plan/decisions.md` D3.
 */
export class TauriGitRemoteClient
  extends TauriGitRefsClient
  implements GitRemoteClient, GitConflictClient
{
  remotes(): Promise<GitRemote[]> {
    return invokeTransport(GIT_REMOTE_COMMANDS.remotes);
  }

  fetch(remote: string | null): Promise<GitFetchResult> {
    return invokeTransport(GIT_REMOTE_COMMANDS.fetch, {
      remote,
    } satisfies GitFetchArgs);
  }

  pull(request: PullRequest): Promise<GitPullResult> {
    return invokeTransport(GIT_REMOTE_COMMANDS.pull, {
      request,
    } satisfies GitPullArgs);
  }

  push(request: PushRequest): Promise<GitPushResult> {
    return invokeTransport(GIT_REMOTE_COMMANDS.push, {
      request,
    } satisfies GitPushArgs);
  }

  conflicts(): Promise<GitConflict[]> {
    return invokeTransport(GIT_REMOTE_COMMANDS.conflicts);
  }

  resolve(path: string, resolution: ConflictResolution): Promise<void> {
    return invokeTransport(GIT_REMOTE_COMMANDS.resolve, {
      path,
      resolution,
    } satisfies GitResolveArgs);
  }
}
