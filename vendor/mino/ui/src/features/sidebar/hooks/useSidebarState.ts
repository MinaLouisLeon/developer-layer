import { useCallback, useMemo } from "react";

import { usePersistentState } from "@/hooks/usePersistentState";

import type { SidebarContextValue, SidebarState, SidebarViewId } from "../types";
import { DEFAULT_VIEW_ID, isKnownViewId } from "../views";

const STORAGE_KEY = "mino.sidebar.v1";

const DEFAULT_STATE: SidebarState = {
  activeView: DEFAULT_VIEW_ID,
  collapsed: false,
};

/**
 * Which view is showing, and whether the panel is open.
 *
 * Persisted for the same reason the split sizes are: reopening the workbench
 * into a different layout than you left it is a small, repeated annoyance.
 * Layout preferences are the only thing this app writes to local storage.
 */
export function useSidebarState(): SidebarContextValue {
  const [stored, setStored] = usePersistentState<SidebarState>(
    STORAGE_KEY,
    DEFAULT_STATE,
  );

  // A stored id from an older build, or a hand-edited storage entry, must not
  // leave the sidebar showing nothing.
  const activeView = isKnownViewId(stored.activeView)
    ? stored.activeView
    : DEFAULT_VIEW_ID;
  const collapsed = stored.collapsed === true;

  const activate = useCallback(
    (id: SidebarViewId) => {
      const sameView = id === activeView;
      setStored({
        activeView: id,
        // Clicking the view already showing toggles the panel; clicking a
        // different one always opens it, since switching to a hidden view
        // would look like nothing happened.
        collapsed: sameView ? !collapsed : false,
      });
    },
    [activeView, collapsed, setStored],
  );

  const setCollapsed = useCallback(
    (next: boolean) => {
      if (next === collapsed) return;
      setStored({ activeView, collapsed: next });
    },
    [activeView, collapsed, setStored],
  );

  return useMemo(
    () => ({ activeView, collapsed, activate, setCollapsed }),
    [activeView, collapsed, activate, setCollapsed],
  );
}
