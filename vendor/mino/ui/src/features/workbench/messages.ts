/**
 * User-facing workbench copy.
 *
 * Kept out of the components so the strings stay shallow and a future
 * translation pass has one file to reach for.
 */
export const WORKBENCH_COPY = {
  changeFolder: "Change folder",
  closeFolder: "Close folder",

  pickerTitle: "Choose a working folder",
  pickerErrorTitle: "Could not open that folder",
  cancel: "Cancel",
  loading: "Reading…",
  noSubfolders: "No sub-folders here.",
  useThisFolder: "Use this folder",
  pathLabel: "Or type a path",
  /**
   * Explains the one thing that is not obvious: the list only walks *down*,
   * because the session root is the boundary the path guard enforces. Typing a
   * path re-roots the session, which is how you reach anywhere else.
   */
  pathHint:
    "The list browses inside the current folder. Type an absolute path to move the session somewhere else.",

  /** Shown when the native picker is asked for outside the desktop app. */
  pickerNeedsDesktop:
    "Choosing a local folder needs the desktop app. This page is running in a browser.",
} as const;
