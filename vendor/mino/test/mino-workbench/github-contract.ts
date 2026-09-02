import type { GitHubClient } from "@/Types";
import { GITHUB_COMMANDS } from "@/Types";

/**
 * The GitHub interface written out once, as a list and as a call for each
 * entry.
 *
 * Beside `git-contract.ts` and for the same reason: the table that walks the
 * surface belongs next to the surface, not inside the test file that happens
 * to use it.
 *
 * `GitHubMethod` is `keyof GitHubClient`, so adding a method to the interface
 * without adding it here is a **type error** rather than a silently untested
 * method - which is the whole point of the table.
 */
export type GitHubMethod = keyof GitHubClient;

/** Both methods on the third trait, in the order Rust declares them. */
export const GITHUB_METHODS: GitHubMethod[] = ["probe", "query"];

/** One call each, with an argument where the method takes one. */
export function callGitHub(
  github: GitHubClient,
  method: GitHubMethod,
): Promise<unknown> {
  switch (method) {
    case "probe":
      return github.probe();
    case "query":
      return github.query({
        kind: "pullRequests",
        detail: { state: "open", limit: 20 },
      });
  }
}

export { GITHUB_COMMANDS };
