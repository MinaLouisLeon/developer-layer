import type { ReactNode } from "react";

import { useSearchRow } from "../context/SearchRowContext";
import {
  SearchRowDirectory,
  SearchRowIcon,
  SearchRowName,
} from "./SearchRowParts";

/**
 * The result row shell. Everything it renders comes from `SearchRowProvider`,
 * so the parts below can be reordered or replaced without threading props -
 * the same arrangement the tree rows use.
 *
 * It is a real button: it takes focus in document order and Enter or Space
 * opens the file in the viewer.
 */
function SearchRowRoot({ children }: { children: ReactNode }) {
  const { hit, selected, onActivate } = useSearchRow();

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      title={hit.entry.path}
      onClick={() => onActivate(hit)}
      className={`flex w-full items-center gap-1.5 px-2 py-0.5 text-left text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong ${
        selected ? "bg-accentMuted" : "hover:bg-surfaceHover"
      }`}
    >
      {children}
    </button>
  );
}

export const SearchRow = Object.assign(SearchRowRoot, {
  Icon: SearchRowIcon,
  Name: SearchRowName,
  Directory: SearchRowDirectory,
});
