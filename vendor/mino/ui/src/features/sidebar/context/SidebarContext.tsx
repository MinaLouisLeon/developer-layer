import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import { useSidebarState } from "../hooks/useSidebarState";
import type { SidebarContextValue } from "../types";

const SidebarContext = createContext<SidebarContextValue | null>(null);

/**
 * Which view the sidebar shows and whether it is open.
 *
 * Held in context rather than passed down because three separate places need
 * it - the rail, the panel and the resizable column that hosts them - and none
 * of them is the parent of the others.
 */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const value = useSidebarState();
  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextValue {
  const sidebar = useContext(SidebarContext);
  if (!sidebar) {
    throw new Error("useSidebar must be used inside a SidebarProvider");
  }
  return sidebar;
}
