import type {
  DiffRequest,
  GitBlame,
  GitBlameArgs,
  GitCommitDetail,
  GitCommitDiffArgs,
  GitDiff,
  GitDiffArgs,
  GitHistoryClient,
  GitLog,
  GitLogArgs,
  GitShowArgs,
  LogRequest,
} from "@/Types";
import { GIT_HISTORY_COMMANDS } from "@/Types";

import { invokeTransport } from "./invoke";

/**
 * The desktop history surface: one method per Tauri command, no logic of its
 * own. `TauriGitClient` extends it, so `client.git` is one object even though
 * the interface is written in two files.
 */
export class TauriGitHistoryClient implements GitHistoryClient {
  diff(request: DiffRequest): Promise<GitDiff> {
    return invokeTransport(GIT_HISTORY_COMMANDS.diff, {
      request,
    } satisfies GitDiffArgs);
  }

  log(request: LogRequest): Promise<GitLog> {
    return invokeTransport(GIT_HISTORY_COMMANDS.log, {
      request,
    } satisfies GitLogArgs);
  }

  show(revision: string): Promise<GitCommitDetail> {
    return invokeTransport(GIT_HISTORY_COMMANDS.show, {
      revision,
    } satisfies GitShowArgs);
  }

  commitDiff(revision: string, path: string | null): Promise<GitDiff> {
    return invokeTransport(GIT_HISTORY_COMMANDS.commitDiff, {
      revision,
      path,
    } satisfies GitCommitDiffArgs);
  }

  blame(path: string): Promise<GitBlame> {
    return invokeTransport(GIT_HISTORY_COMMANDS.blame, {
      path,
    } satisfies GitBlameArgs);
  }
}
