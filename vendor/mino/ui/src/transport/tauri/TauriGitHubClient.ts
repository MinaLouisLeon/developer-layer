import type {
  GitHubClient,
  GitHubProbe,
  GitHubQuery,
  GitHubQueryArgs,
  GitHubResponse,
} from "@/Types";
import { GITHUB_COMMANDS } from "@/Types";

import { invokeTransport } from "./invoke";

/**
 * The desktop GitHub surface: one method per Tauri command, no logic of its
 * own.
 *
 * The smallest of the three clients, and it is small for the reason the trait
 * is: the caller picks a `GitHubQuery` variant and Rust owns the `gh`
 * subcommand behind it. A client that spelled out five list methods would be
 * five places for the same `invoke` to be written.
 *
 * A standalone class rather than another link in the `TauriGitClient`
 * inheritance chain, because it is a different surface reached from a
 * different property - `client.github`, not `client.git` - exactly as
 * `Transport::github()` is separate from `Transport::git()` in Rust.
 *
 * Note what is *not* here: no probe caching, no confirmation before the query
 * that writes, and no decision about when to refresh. Caching the probe is
 * `GitHubContext`'s job, confirming is the section's, and neither belongs in
 * a client whose whole purpose is to have no state.
 */
export class TauriGitHubClient implements GitHubClient {
  probe(): Promise<GitHubProbe> {
    return invokeTransport(GITHUB_COMMANDS.probe);
  }

  query(request: GitHubQuery): Promise<GitHubResponse> {
    return invokeTransport(GITHUB_COMMANDS.query, {
      request,
    } satisfies GitHubQueryArgs);
  }
}
