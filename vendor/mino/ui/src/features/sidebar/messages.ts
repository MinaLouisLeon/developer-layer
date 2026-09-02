/**
 * User-facing sidebar copy.
 *
 * Kept out of the components so the strings stay shallow and a future
 * translation pass has one file to reach for.
 */
export const SIDEBAR_COPY = {
  railLabel: "Views",
  files: "Files",
  search: "Search",
  sourceControl: "Source control",
  github: "GitHub",

  /** Tooltip suffix on the active view's button, which toggles the panel. */
  hidePanel: "Hide",
  showPanel: "Show",
} as const;
