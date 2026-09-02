import type { GitClient } from "@/Types";
import {
  GIT_BRANCH_COMMANDS,
  GIT_COMMANDS,
  GIT_HISTORY_COMMANDS,
  GIT_REMOTE_COMMANDS,
  GIT_STASH_COMMANDS,
} from "@/Types";

/**
 * The git interface written out once, as a list and as a call for each entry.
 *
 * Beside `transport-contract.test.ts` rather than inside it, for the reason
 * the fake surfaces are split the same way: `GitClient` now spans four
 * modules, and the table that walks every one of them is the largest thing in
 * that file without being what the file is about.
 *
 * `GitMethod` is `keyof GitClient`, so adding a method to the interface
 * without adding it here is a **type error** rather than a silently untested
 * method - which is the whole point of the table.
 */
export type GitMethod = keyof GitClient;

/** Every method on the second trait, in the order Rust declares them. */
export const GIT_METHODS: GitMethod[] = [
  "repository",
  "status",
  "stage",
  "unstage",
  "discard",
  "commit",
  "diff",
  "log",
  "show",
  "commitDiff",
  "blame",
  "branches",
  "checkout",
  "createBranch",
  "deleteBranch",
  "stashList",
  "stashPush",
  "stashApply",
  "stashDrop",
  "remotes",
  "fetch",
  "pull",
  "push",
  "conflicts",
  "resolve",
];

/**
 * Every command map, keyed by method name.
 *
 * Each map keys its commands by the method they belong to, which is what lets
 * "one Tauri command per method" be checked by name here rather than by a
 * second table somebody has to keep in step.
 */
export const ALL_GIT_COMMANDS = {
  ...GIT_COMMANDS,
  ...GIT_HISTORY_COMMANDS,
  ...GIT_BRANCH_COMMANDS,
  ...GIT_STASH_COMMANDS,
  ...GIT_REMOTE_COMMANDS,
};

/** One call each, with an argument where the method takes one. */
export function callGit(git: GitClient, method: GitMethod): Promise<unknown> {
  switch (method) {
    case "repository":
      return git.repository();
    case "status":
      return git.status();
    case "commit":
      return git.commit({ message: "m", all: false, amend: false });
    case "diff":
      return git.diff({ path: null, staged: false, against: null });
    case "log":
      return git.log({ limit: null, skip: 0, path: null });
    case "show":
      return git.show("HEAD");
    case "commitDiff":
      return git.commitDiff("HEAD", null);
    case "blame":
      return git.blame("/root/a.txt");
    case "branches":
      return git.branches();
    case "checkout":
      return git.checkout("main");
    case "createBranch":
      return git.createBranch({ name: "feat", from: null, checkout: false });
    case "deleteBranch":
      return git.deleteBranch("feat", false);
    case "stashList":
      return git.stashList();
    case "stashPush":
      return git.stashPush({ message: null, includeUntracked: false });
    case "stashApply":
      return git.stashApply(0, false);
    case "stashDrop":
      return git.stashDrop(0);
    case "remotes":
      return git.remotes();
    case "fetch":
      return git.fetch(null);
    case "pull":
      return git.pull({ remote: null, rebase: false });
    case "push":
      return git.push({
        remote: null,
        branch: null,
        force: false,
        setUpstream: false,
      });
    case "conflicts":
      return git.conflicts();
    case "resolve":
      return git.resolve("/root/a.txt", "manual");
    // stage, unstage and discard, which all take one array of paths.
    default:
      return git[method](["/root/a.txt"]);
  }
}
