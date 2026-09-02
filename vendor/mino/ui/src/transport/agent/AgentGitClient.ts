import type {
  CommitRequest,
  CreateBranchRequest,
  DiffRequest,
  GitBlame,
  GitBranch,
  GitClient,
  GitCommit,
  GitCommitDetail,
  GitDiff,
  GitLog,
  GitRepository,
  GitStash,
  GitStatus,
  LogRequest,
  StashRequest,
} from "@/Types";
import {
  GIT_BRANCH_COMMANDS,
  GIT_COMMANDS,
  GIT_HISTORY_COMMANDS,
  GIT_STASH_COMMANDS,
} from "@/Types";

import { AgentGitRemoteClient } from "./AgentGitRemoteClient";

/**
 * The browser git surface: declared, not built.
 *
 * Rejects with the same typed `Unimplemented` error the Rust stub returns, and
 * with the same feature names, so the panes behave identically whichever end
 * answers.
 *
 * The remote and conflict halves are inherited from `AgentGitRemoteClient`, so
 * this is one object however many files describe it - the same arrangement the
 * desktop client uses.
 *
 * Note what it does *not* do: `repository()` does not resolve `null`. "There is
 * no agent protocol for this yet" and "this folder is not a repository" are
 * different facts, and a quiet UI would hide the first behind the second.
 */
export class AgentGitClient extends AgentGitRemoteClient implements GitClient {
  repository(): Promise<GitRepository | null> {
    return this.reject(GIT_COMMANDS.repository);
  }

  status(): Promise<GitStatus> {
    return this.reject(GIT_COMMANDS.status);
  }

  stage(_paths: string[]): Promise<void> {
    return this.reject(GIT_COMMANDS.stage);
  }

  unstage(_paths: string[]): Promise<void> {
    return this.reject(GIT_COMMANDS.unstage);
  }

  discard(_paths: string[]): Promise<void> {
    return this.reject(GIT_COMMANDS.discard);
  }

  commit(_request: CommitRequest): Promise<GitCommit> {
    return this.reject(GIT_COMMANDS.commit);
  }

  diff(_request: DiffRequest): Promise<GitDiff> {
    return this.reject(GIT_HISTORY_COMMANDS.diff);
  }

  log(_request: LogRequest): Promise<GitLog> {
    return this.reject(GIT_HISTORY_COMMANDS.log);
  }

  show(_revision: string): Promise<GitCommitDetail> {
    return this.reject(GIT_HISTORY_COMMANDS.show);
  }

  commitDiff(_revision: string, _path: string | null): Promise<GitDiff> {
    return this.reject(GIT_HISTORY_COMMANDS.commitDiff);
  }

  blame(_path: string): Promise<GitBlame> {
    return this.reject(GIT_HISTORY_COMMANDS.blame);
  }

  branches(): Promise<GitBranch[]> {
    return this.reject(GIT_BRANCH_COMMANDS.branches);
  }

  checkout(_name: string): Promise<void> {
    return this.reject(GIT_BRANCH_COMMANDS.checkout);
  }

  createBranch(_request: CreateBranchRequest): Promise<GitBranch> {
    return this.reject(GIT_BRANCH_COMMANDS.createBranch);
  }

  deleteBranch(_name: string, _force: boolean): Promise<void> {
    return this.reject(GIT_BRANCH_COMMANDS.deleteBranch);
  }

  stashList(): Promise<GitStash[]> {
    return this.reject(GIT_STASH_COMMANDS.stashList);
  }

  stashPush(_request: StashRequest): Promise<void> {
    return this.reject(GIT_STASH_COMMANDS.stashPush);
  }

  stashApply(_index: number, _pop: boolean): Promise<void> {
    return this.reject(GIT_STASH_COMMANDS.stashApply);
  }

  stashDrop(_index: number): Promise<void> {
    return this.reject(GIT_STASH_COMMANDS.stashDrop);
  }
}
