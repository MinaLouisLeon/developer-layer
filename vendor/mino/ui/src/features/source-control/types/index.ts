/**
 * The source control view models, one file per surface.
 *
 * A folder rather than one file because the panel grew a branch control, a
 * stash section, remote controls and a conflict list, and the groups have
 * nothing to say to each other: `changes` is the working tree, `branches` is
 * where HEAD points, `stash` is the stack, and `remote` is what leaves the
 * machine and what a merge could not settle. Everything re-exports through
 * here, so nothing outside this folder has to know which file a type lives
 * in.
 */
export type * from "./branches";
export type * from "./changes";
export type * from "./remote";
export type * from "./stash";
