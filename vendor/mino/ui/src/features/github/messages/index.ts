/**
 * User-facing GitHub copy, one file per surface.
 *
 * A folder rather than one file because the pane's four sections and the
 * review threads have nothing to say to each other, and one file for all of
 * them would be past the project's ceiling. Everything re-exports through
 * here, so a component imports one path however many files the strings live
 * in.
 *
 * Kept out of the components so the strings stay shallow and a future
 * translation pass has one folder to reach for.
 */
export * from "./review";
export * from "./sections";
