import type { DirEntry } from "@/Types";

export type LoadStatus = "idle" | "loading" | "loaded" | "error";

/** One directory's listing state. Directories are loaded on expand, never up front. */
export interface DirectoryState {
  status: LoadStatus;
  error: string | null;
  entries: DirEntry[] | null;
}

export type DirectoryMap = Record<string, DirectoryState>;

/** A single visible row, already flattened and depth-tagged. */
export interface TreeRowModel {
  entry: DirEntry;
  depth: number;
  expanded: boolean;
  status: LoadStatus;
  error: string | null;
}

export interface TreeRowContextValue {
  row: TreeRowModel;
  selected: boolean;
  onActivate: (row: TreeRowModel) => void;
  onExpandKey: (row: TreeRowModel, expand: boolean) => void;
  /** Developer Layer addition: opens the archive menu. See ../../VENDOR.md. */
  onContextMenu: (row: TreeRowModel, x: number, y: number) => void;
}

export interface FileTreeState {
  rows: TreeRowModel[];
  rootStatus: LoadStatus;
  rootError: string | null;
  toggle: (row: TreeRowModel) => void;
  setExpanded: (row: TreeRowModel, expand: boolean) => void;
  /**
   * Developer Layer addition: re-reads every loaded folder.
   *
   * Already implemented upstream for the git-refresh hook; only the return
   * exposes it, so an archive action can show its new file. See ../../VENDOR.md.
   */
  reload: () => void;
}
