/**
 * User-facing source control copy, one file per surface.
 *
 * Split the way `../types` is, and for the same reason: the panel covers the
 * working tree, the branch control, the stash, the remote and the conflicts,
 * and they have nothing to say to each other. Everything re-exports through here, so a component
 * imports one path however many files the strings live in.
 *
 * Kept out of the components so the strings stay shallow and a future
 * translation pass has one folder to reach for.
 */
export * from "./branches";
export * from "./changes";
export * from "./remote";
export * from "./stash";
