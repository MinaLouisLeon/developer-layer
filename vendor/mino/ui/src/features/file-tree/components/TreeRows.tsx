import { TreeRowProvider } from "../context/TreeRowContext";
import type { TreeRowContextValue, TreeRowModel } from "../types";
import { TreeRow } from "./TreeRow";

interface TreeRowsProps {
  rows: TreeRowModel[];
  selectedPath: string | null;
  onActivate: TreeRowContextValue["onActivate"];
  onExpandKey: TreeRowContextValue["onExpandKey"];
  /** Developer Layer addition. See ../../VENDOR.md. */
  onContextMenu: TreeRowContextValue["onContextMenu"];
}

/** The flattened list. One provider per row; no prop drilling past it. */
export function TreeRows({
  rows,
  selectedPath,
  onActivate,
  onExpandKey,
  onContextMenu,
}: TreeRowsProps) {
  return (
    <div role="tree" aria-label="Folder contents" className="py-1">
      {rows.map((row) => (
        <TreeRowProvider
          key={row.entry.path}
          value={{
            row,
            selected: row.entry.path === selectedPath,
            onActivate,
            onExpandKey,
            onContextMenu,
          }}
        >
          <TreeRow>
            <TreeRow.Indent />
            <TreeRow.Chevron />
            <TreeRow.Icon />
            <TreeRow.Label />
            <TreeRow.GitStatus />
            <TreeRow.Status />
          </TreeRow>
        </TreeRowProvider>
      ))}
    </div>
  );
}
