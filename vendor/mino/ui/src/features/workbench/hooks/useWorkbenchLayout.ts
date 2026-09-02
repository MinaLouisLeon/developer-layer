import { useCallback } from "react";

import { usePersistentState } from "@/hooks/usePersistentState";

import type { LayoutSizes } from "../types";

const STORAGE_KEY = "mino.layout.v1";

/**
 * `tree` is the left column's share of the window; `viewer` and `terminal`
 * split the right column between them.
 */
const DEFAULT_SIZES: LayoutSizes = { tree: 24, viewer: 62, terminal: 38 };

/**
 * Persisted split sizes. Layout preferences are the only thing this app is
 * allowed to write to local storage - never credentials, keys or file
 * contents.
 */
export function useWorkbenchLayout() {
  const [sizes, setSizes] = usePersistentState<LayoutSizes>(
    STORAGE_KEY,
    DEFAULT_SIZES,
  );

  const onColumnsLayout = useCallback(
    (next: number[]) => {
      const [tree] = next;
      if (tree === undefined) return;
      // A zero means the sidebar is collapsed, not that it is one pixel wide.
      // Storing it would reopen the workbench with a sidebar that expands to
      // nothing, so the last real width is kept instead.
      if (tree === 0) return;
      setSizes({ ...sizes, tree });
    },
    [setSizes, sizes],
  );

  const onRightLayout = useCallback(
    (next: number[]) => {
      const [viewer, terminal] = next;
      if (viewer === undefined || terminal === undefined) return;
      setSizes({ ...sizes, viewer, terminal });
    },
    [setSizes, sizes],
  );

  return { sizes, onColumnsLayout, onRightLayout };
}
