/**
 * User-facing search copy.
 *
 * Kept out of the components so the strings stay shallow and a future
 * translation pass has one file to reach for.
 */
export const SEARCH_COPY = {
  title: "Search",
  placeholder: "Search files by name",
  inputLabel: "Search files by name",
  clear: "Clear the search",

  promptTitle: "Search this folder",
  promptDescription:
    "Type part of a filename. Letters are matched in order, so `ftp` finds `FileTreePane.tsx`.",

  noFolderTitle: "No folder open",
  noFolderDescription: "Open a folder to search inside it.",

  searching: "Searching…",
  searchingDescription: "Walking the folder.",

  emptyTitle: "No matching files",
  emptyDescription: "Nothing under this folder matches that.",

  errorTitle: "Could not search this folder",

  /** The one thing worth saying about a result set: whether it is complete. */
  truncatedNote: "Showing the best matches only.",
} as const;

/** "12 of 3,481 files" - the count strip under the input. */
export function describeCounts(shown: number, scanned: number): string {
  const files = scanned.toLocaleString("en-US");
  return `${shown} of ${files} ${scanned === 1 ? "file" : "files"}`;
}
