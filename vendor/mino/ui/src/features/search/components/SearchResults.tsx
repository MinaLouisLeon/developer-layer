import type { SearchHit } from "@/Types";

import { SearchRowProvider } from "../context/SearchRowContext";
import { SEARCH_COPY } from "../messages";
import { splitPath } from "../splitPath";
import { SearchRow } from "./SearchRow";

interface SearchResultsProps {
  hits: SearchHit[];
  selectedPath: string | null;
  truncated: boolean;
  onActivate: (hit: SearchHit) => void;
}

/** The ranked list. One provider per row; no prop drilling past it. */
export function SearchResults({
  hits,
  selectedPath,
  truncated,
  onActivate,
}: SearchResultsProps) {
  return (
    <div className="py-1">
      <div role="listbox" aria-label={SEARCH_COPY.title}>
        {hits.map((hit) => (
          <SearchRowProvider
            key={hit.entry.path}
            value={{
              hit,
              path: splitPath(hit),
              selected: hit.entry.path === selectedPath,
              onActivate,
            }}
          >
            <SearchRow>
              <SearchRow.Icon />
              <SearchRow.Name />
              <SearchRow.Directory />
            </SearchRow>
          </SearchRowProvider>
        ))}
      </div>
      {truncated ? (
        <p className="px-2 pt-1.5 text-xs text-textFaint">
          {SEARCH_COPY.truncatedNote}
        </p>
      ) : null}
    </div>
  );
}
