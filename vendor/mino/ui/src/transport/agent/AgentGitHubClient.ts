import type {
  GitHubClient,
  GitHubProbe,
  GitHubQuery,
  GitHubResponse,
  TransportError,
} from "@/Types";
import { GITHUB_COMMANDS } from "@/Types";

/**
 * The browser GitHub surface: declared, not built.
 *
 * Rejects with the same typed `Unimplemented` error the Rust stub returns, and
 * with the same feature names, so the sections behave identically whichever
 * end answers.
 *
 * Note what it does *not* do, and it is the sharper version of the trap
 * `AgentGitClient` documents. `probe()` does **not** resolve an `unsupported`
 * probe. "There is no agent protocol for this yet" and "this folder has no
 * GitHub repository" render the same way - one quiet sentence and nothing else
 * - and only one of them is a bug waiting to be finished. Answering the first
 * with the second would hide it for good.
 */
export class AgentGitHubClient implements GitHubClient {
  private reject<T>(feature: string): Promise<T> {
    const error: TransportError = {
      kind: "unimplemented",
      detail: { feature, transport: "remoteAgent" },
    };
    return Promise.reject(error);
  }

  probe(): Promise<GitHubProbe> {
    return this.reject(GITHUB_COMMANDS.probe);
  }

  query(_request: GitHubQuery): Promise<GitHubResponse> {
    return this.reject(GITHUB_COMMANDS.query);
  }
}
