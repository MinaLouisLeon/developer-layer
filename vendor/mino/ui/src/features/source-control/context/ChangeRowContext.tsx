import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import type { ChangeRowContextValue } from "../types";

const ChangeRowContext = createContext<ChangeRowContextValue | null>(null);

/**
 * Holds one row's data so the row's parts read it from context instead of
 * being handed it prop by prop.
 *
 * The third instance of the pattern, after `TreeRow` and `SearchRow`. It is
 * the house style for a repeated list item, and this row is the one that most
 * needs it: its parts include a destructive control, and threading four
 * handlers through them would put the row past the six-prop ceiling.
 */
export function ChangeRowProvider({
  value,
  children,
}: {
  value: ChangeRowContextValue;
  children: ReactNode;
}) {
  return (
    <ChangeRowContext.Provider value={value}>
      {children}
    </ChangeRowContext.Provider>
  );
}

export function useChangeRow(): ChangeRowContextValue {
  const row = useContext(ChangeRowContext);
  if (!row) {
    throw new Error(
      "ChangeRow parts must be rendered inside a ChangeRowProvider",
    );
  }
  return row;
}
