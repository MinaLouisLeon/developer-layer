import { useCallback, useState } from "react";

import { useSelection } from "@/features/workbench/context/SelectionContext";
import { useSessionContext } from "@/features/workbench/context/SessionContext";

// Developer Layer addition. See ../../../../VENDOR.md.
import { useArchiveActions } from "../archive";
import type { ArchiveMenuTarget } from "../archive";
import type { TreeRowModel } from "../types";
import { useFileTree } from "./useFileTree";

/**
 * Everything the tree pane needs, so the component stays presentational:
 * the root from the session, the lazy-loaded rows, and what a row activation
 * means (expand a folder, or hand a file to the viewer).
 */
export function useFileTreePane() {
  const { connection } = useSessionContext();
  const { selected, select } = useSelection();
  const root = connection?.root ?? null;
  const { rows, rootStatus, rootError, toggle, setExpanded, reload } = useFileTree(root);

  // Developer Layer addition: the archive menu and its one open target. The
  // menu is a singleton rather than one per row — two open at once is not a
  // state a right-click can reach, and rendering 500 of them would be.
  const [menu, setMenu] = useState<ArchiveMenuTarget | null>(null);
  const archive = useArchiveActions(reload);

  const onActivate = useCallback(
    (row: TreeRowModel) => {
      if (row.entry.kind === "directory") {
        toggle(row);
        return;
      }
      select(row.entry);
    },
    [toggle, select],
  );

  const onExpandKey = useCallback(
    (row: TreeRowModel, expand: boolean) => setExpanded(row, expand),
    [setExpanded],
  );

  const onContextMenu = useCallback(
    (row: TreeRowModel, x: number, y: number) => {
      // A new menu clears the last result: leaving it up would attach the
      // previous action's message to the row now under the pointer.
      archive.clear();
      setMenu({ entry: row.entry, x, y });
    },
    [archive],
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  return {
    root,
    rows,
    rootStatus,
    rootError,
    selectedPath: selected?.path ?? null,
    onActivate,
    onExpandKey,
    onContextMenu,
    menu,
    closeMenu,
    archive,
  };
}
