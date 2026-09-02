import { Search, X } from "lucide-react";

import { SEARCH_COPY } from "../messages";

interface SearchFieldProps {
  query: string;
  setQuery: (query: string) => void;
  disabled: boolean;
}

/** The input strip at the top of the search pane. */
export function SearchField({ query, setQuery, disabled }: SearchFieldProps) {
  return (
    <div className="shrink-0 border-b border-border px-2 py-2">
      <div className="flex items-center gap-1.5 rounded border border-border bg-surfaceSunken px-2 py-1 focus-within:border-borderStrong">
        <Search
          size={14}
          strokeWidth={1.5}
          aria-hidden="true"
          className="shrink-0 text-textFaint"
        />
        <input
          type="text"
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={SEARCH_COPY.inputLabel}
          placeholder={SEARCH_COPY.placeholder}
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-sm text-text placeholder:text-textFaint focus:outline-none disabled:cursor-not-allowed"
        />
        {query === "" ? null : (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={SEARCH_COPY.clear}
            title={SEARCH_COPY.clear}
            className="shrink-0 text-textFaint hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
          >
            <X size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
