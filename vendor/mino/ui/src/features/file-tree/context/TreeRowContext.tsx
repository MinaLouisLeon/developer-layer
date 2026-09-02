import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import type { TreeRowContextValue } from "../types";

const TreeRowContext = createContext<TreeRowContextValue | null>(null);

/**
 * Holds one row's data so the row's parts read it from context instead of
 * being handed it prop by prop. Repeated list items are built this way across
 * the app.
 */
export function TreeRowProvider({
  value,
  children,
}: {
  value: TreeRowContextValue;
  children: ReactNode;
}) {
  return (
    <TreeRowContext.Provider value={value}>{children}</TreeRowContext.Provider>
  );
}

export function useTreeRow(): TreeRowContextValue {
  const row = useContext(TreeRowContext);
  if (!row) {
    throw new Error("TreeRow parts must be rendered inside a TreeRowProvider");
  }
  return row;
}
