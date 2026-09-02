import type { SearchHit } from "@/Types";

import type { SplitPath } from "./types";

/**
 * Splits a hit's relative path into folder and filename, carrying the match
 * highlights across the seam.
 *
 * The transport matches against - and indexes into - the whole relative path,
 * because that is what a person types against: `srcmain` should find
 * `src/main.rs`. The row, though, reads better with the filename first and its
 * folder trailing quietly behind it, so the indices have to be re-based onto
 * each half here rather than in the component.
 */
export function splitPath(hit: SearchHit): SplitPath {
  const path = hit.relativePath;
  const cut = path.lastIndexOf("/");
  if (cut < 0) {
    return {
      directory: "",
      name: path,
      directoryMatches: [],
      nameMatches: [...hit.matchIndices],
    };
  }

  const nameStart = cut + 1;
  const directoryMatches: number[] = [];
  const nameMatches: number[] = [];
  for (const index of hit.matchIndices) {
    // The separator itself can be matched - a query containing `/` does it -
    // and belongs to neither half, so it is simply not highlighted.
    if (index < cut) directoryMatches.push(index);
    else if (index >= nameStart) nameMatches.push(index - nameStart);
  }

  return {
    directory: path.slice(0, cut),
    name: path.slice(nameStart),
    directoryMatches,
    nameMatches,
  };
}
