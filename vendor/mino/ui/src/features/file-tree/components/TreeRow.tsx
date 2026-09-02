import type { KeyboardEvent, ReactNode } from "react";

import { useTreeRow } from "../context/TreeRowContext";
import {
  TreeRowChevron,
  TreeRowGitStatus,
  TreeRowIcon,
  TreeRowIndent,
  TreeRowLabel,
  TreeRowStatus,
} from "./TreeRowParts";

/**
 * The row shell. Everything it renders comes from `TreeRowProvider`, so the
 * parts below can be reordered or replaced without threading props.
 *
 * It is a real button: Enter and Space activate it, arrow keys expand and
 * collapse, and it takes focus in document order.
 */
function TreeRowRoot({ children }: { children: ReactNode }) {
  const { row, selected, onActivate, onExpandKey, onContextMenu } = useTreeRow();
  const isDirectory = row.entry.kind === "directory";

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!isDirectory) return;
    if (event.key === "ArrowRight" && !row.expanded) {
      event.preventDefault();
      onExpandKey(row, true);
    }
    if (event.key === "ArrowLeft" && row.expanded) {
      event.preventDefault();
      onExpandKey(row, false);
    }
  };

  return (
    <button
      type="button"
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={selected}
      aria-expanded={isDirectory ? row.expanded : undefined}
      title={row.entry.path}
      onClick={() => onActivate(row)}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => {
        // Developer Layer addition. The browser's own menu offers nothing
        // useful inside a shell and would cover this one. See ../../VENDOR.md.
        event.preventDefault();
        onContextMenu(row, event.clientX, event.clientY);
      }}
      className={`flex w-full items-center gap-1.5 px-2 py-0.5 text-left text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong ${
        selected ? "bg-accentMuted" : "hover:bg-surfaceHover"
      }`}
    >
      {children}
    </button>
  );
}

export const TreeRow = Object.assign(TreeRowRoot, {
  Indent: TreeRowIndent,
  Chevron: TreeRowChevron,
  Icon: TreeRowIcon,
  Label: TreeRowLabel,
  GitStatus: TreeRowGitStatus,
  Status: TreeRowStatus,
});
