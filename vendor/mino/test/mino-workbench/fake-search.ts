import type { SearchHit, SearchHits, SearchQuery, TransportError } from "@/Types";

import { makeEntry } from "./fake-transport";

/**
 * The search half of the fake transport, kept beside it rather than in it so
 * neither file grows past the project's ceiling.
 *
 * Matching here is a plain substring test, not the real fuzzy matcher.
 * Ranking is decided in Rust and proven there; a pane test wants a predictable
 * result set, not a second implementation of the scorer to keep in step with
 * the first.
 */
export function searchFiles(
  paths: string[],
  query: SearchQuery,
  failure?: TransportError,
): Promise<SearchHits> {
  if (failure) return Promise.reject(failure);

  const needle = query.query.trim().toLowerCase();
  const matched = paths.filter((path) => path.toLowerCase().includes(needle));
  const limit = query.limit ?? 200;

  return Promise.resolve({
    hits: matched.slice(0, limit).map(toHit),
    truncated: matched.length > limit,
    scanned: paths.length,
  });
}

/** A relative path as the search pane receives it, with no highlight ranges. */
function toHit(relativePath: string): SearchHit {
  return {
    entry: makeEntry(`/root/${relativePath}`),
    relativePath,
    score: 100,
    matchIndices: [],
  };
}
