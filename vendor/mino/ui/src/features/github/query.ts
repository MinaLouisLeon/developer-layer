import type {
  GitHubClient,
  GitHubDetail,
  GitHubQuery,
  GitHubResponseKind,
  TransportError,
} from "@/Types";

/**
 * Ask for one thing, and get back the thing you asked for.
 *
 * The cost of five features sharing one transport method is that the answer
 * arrives tagged: `query()` resolves a `GitHubResponse`, and a caller has to
 * narrow it. This is where that is paid, once, so no section writes a `switch`
 * over seven variants to read the one it wanted.
 *
 * A response of the wrong shape rejects with a typed protocol error rather
 * than resolving `undefined`. It should be unreachable - Rust carries the
 * expected shape alongside the argv rather than inferring it - so if it ever
 * fires, the two sides have drifted and that is worth a sentence rather than
 * an empty list.
 */
export async function ask<K extends GitHubResponseKind>(
  client: GitHubClient,
  request: GitHubQuery,
  expected: K,
): Promise<GitHubDetail<K>> {
  const response = await client.query(request);
  if (response.kind !== expected) {
    const mismatch: TransportError = {
      kind: "protocol",
      detail: {
        message: `asked GitHub for ${expected} and was answered with ${response.kind}`,
      },
    };
    throw mismatch;
  }
  return response.detail as GitHubDetail<K>;
}
