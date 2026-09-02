import type {
  CreateBranchRequest,
  GitBranch,
  GitBranchClient,
  GitBranchNameArgs,
  GitCreateBranchArgs,
  GitDeleteBranchArgs,
  GitStash,
  GitStashApplyArgs,
  GitStashClient,
  GitStashIndexArgs,
  GitStashPushArgs,
  StashRequest,
} from "@/Types";
import { GIT_BRANCH_COMMANDS, GIT_STASH_COMMANDS } from "@/Types";

import { invokeTransport } from "./invoke";
import { TauriGitHistoryClient } from "./TauriGitHistoryClient";

/**
 * The desktop branch and stash surfaces: one method per Tauri command, no
 * logic of its own.
 *
 * It extends the history client and is extended by `TauriGitClient`, which is
 * how four interfaces become one object across a language that has single
 * inheritance. The alternative - eight more methods on `TauriGitClient` - is
 * the same object with one file doing the work of three.
 *
 * Note what is *not* here. No confirmation before a delete or a drop, no
 * warning about an unsaved draft before a checkout, and no refresh afterwards.
 * All three are the panel's job, and putting any of them here would be a
 * second place to keep them right.
 */
export class TauriGitRefsClient
  extends TauriGitHistoryClient
  implements GitBranchClient, GitStashClient
{
  branches(): Promise<GitBranch[]> {
    return invokeTransport(GIT_BRANCH_COMMANDS.branches);
  }

  checkout(name: string): Promise<void> {
    return invokeTransport(GIT_BRANCH_COMMANDS.checkout, {
      name,
    } satisfies GitBranchNameArgs);
  }

  createBranch(request: CreateBranchRequest): Promise<GitBranch> {
    return invokeTransport(GIT_BRANCH_COMMANDS.createBranch, {
      request,
    } satisfies GitCreateBranchArgs);
  }

  deleteBranch(name: string, force: boolean): Promise<void> {
    return invokeTransport(GIT_BRANCH_COMMANDS.deleteBranch, {
      name,
      force,
    } satisfies GitDeleteBranchArgs);
  }

  stashList(): Promise<GitStash[]> {
    return invokeTransport(GIT_STASH_COMMANDS.stashList);
  }

  stashPush(request: StashRequest): Promise<void> {
    return invokeTransport(GIT_STASH_COMMANDS.stashPush, {
      request,
    } satisfies GitStashPushArgs);
  }

  stashApply(index: number, pop: boolean): Promise<void> {
    return invokeTransport(GIT_STASH_COMMANDS.stashApply, {
      index,
      pop,
    } satisfies GitStashApplyArgs);
  }

  stashDrop(index: number): Promise<void> {
    return invokeTransport(GIT_STASH_COMMANDS.stashDrop, {
      index,
    } satisfies GitStashIndexArgs);
  }
}
