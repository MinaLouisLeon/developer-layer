import { useCallback, useEffect, useRef, useState } from "react";

import type { ImperativePanelHandle } from "react-resizable-panels";

import { useSidebar } from "../context/SidebarContext";

/**
 * Ties the sidebar's collapsed flag to the resizable column that hosts it.
 *
 * Collapsing runs in two directions and both have to end in the same place:
 * the rail toggles the flag and the panel must follow, and dragging the handle
 * shut collapses the panel and the flag must follow. The effect handles the
 * first, the callbacks the second. Neither loops, because each side checks the
 * value before setting it.
 *
 * The panel collapses rather than unmounting, so the views inside keep their
 * state while hidden - see `SidebarPanel`.
 *
 * @param onColumnsLayout the group's own layout handler, wrapped rather than
 * replaced: this hook needs to know when the group has measured itself, and
 * `onLayout` is the only thing that says so.
 */
export function useSidebarPanel(onColumnsLayout: (sizes: number[]) => void) {
  const { collapsed, setCollapsed } = useSidebar();
  const ref = useRef<ImperativePanelHandle>(null);
  const [measured, setMeasured] = useState(false);

  const onLayout = useCallback(
    (next: number[]) => {
      setMeasured(true);
      onColumnsLayout(next);
    },
    [onColumnsLayout],
  );

  useEffect(() => {
    const panel = ref.current;
    // Every imperative call throws until the group has a layout to change -
    // reading `isCollapsed()` included - so nothing is attempted before the
    // first `onLayout`. The flag is re-applied whenever it changes, so a sync
    // skipped here is not a sync lost.
    if (!panel || !measured) return;
    if (collapsed && !panel.isCollapsed()) {
      panel.collapse();
    } else if (!collapsed && panel.isCollapsed()) {
      panel.expand();
    }
  }, [collapsed, measured]);

  const onCollapse = useCallback(() => setCollapsed(true), [setCollapsed]);
  const onExpand = useCallback(() => setCollapsed(false), [setCollapsed]);

  return { ref, onLayout, onCollapse, onExpand };
}
