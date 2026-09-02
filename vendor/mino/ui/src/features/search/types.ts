import type { SearchHit } from "@/Types";

export type SearchStatus = "idle" | "searching" | "ready" | "error";

export interface FileSearchState {
  query: string;
  setQuery: (query: string) => void;
  status: SearchStatus;
  hits: SearchHit[];
  /** The walk stopped early, so the list is a prefix of the real answer. */
  truncated: boolean;
  /** How many entries the walk visited, whether or not they matched. */
  scanned: number;
  error: string | null;
  /** Opens a hit in the viewer, the way activating a tree row does. */
  onActivate: (hit: SearchHit) => void;
}

export interface SearchRowContextValue {
  hit: SearchHit;
  /** Split once per row and read by the parts, rather than split per part. */
  path: SplitPath;
  selected: boolean;
  onActivate: (hit: SearchHit) => void;
}

/**
 * A relative path split for display: the filename, its parent folder, and
 * which characters the query matched in each half.
 *
 * The transport returns one string and one set of indices into it; the row
 * shows the name prominently and the folder quietly beside it, so the split
 * has to carry the highlights across with it.
 */
export interface SplitPath {
  directory: string;
  name: string;
  directoryMatches: number[];
  nameMatches: number[];
}
