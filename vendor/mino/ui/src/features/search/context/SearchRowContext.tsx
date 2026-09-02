import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import type { SearchRowContextValue } from "../types";

const SearchRowContext = createContext<SearchRowContextValue | null>(null);

/**
 * One provider per result row, so the row's parts read what they need instead
 * of being handed it. The same arrangement the tree rows use.
 */
export function SearchRowProvider({
  value,
  children,
}: {
  value: SearchRowContextValue;
  children: ReactNode;
}) {
  return (
    <SearchRowContext.Provider value={value}>
      {children}
    </SearchRowContext.Provider>
  );
}

export function useSearchRow(): SearchRowContextValue {
  const row = useContext(SearchRowContext);
  if (!row) {
    throw new Error("useSearchRow must be used inside a SearchRowProvider");
  }
  return row;
}
