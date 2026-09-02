import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { DirEntry } from "@/Types";

import type { SelectionContextValue } from "../types";

const SelectionContext = createContext<SelectionContextValue | null>(null);

/**
 * The file the tree selected and the viewer shows. Held here so neither pane
 * has to know the other exists.
 */
export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selected, select] = useState<DirEntry | null>(null);
  const value = useMemo(() => ({ selected, select }), [selected]);
  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection(): SelectionContextValue {
  const selection = useContext(SelectionContext);
  if (!selection) {
    throw new Error("useSelection must be used inside a SelectionProvider");
  }
  return selection;
}
