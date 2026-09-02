import type { ReactNode } from "react";

import { useChangeRow } from "../context/ChangeRowContext";
import {
  ChangeRowActions,
  ChangeRowPath,
  ChangeRowState,
} from "./ChangeRowParts";

/**
 * The row shell. Everything it renders comes from `ChangeRowProvider`, so the
 * parts can be reordered or replaced without threading props.
 *
 * A `div` with a nested button rather than a button, because the row's own
 * controls are buttons and a button cannot contain one. The opening affordance
 * is the path itself, which is what carries the file's identity anyway.
 */
function ChangeRowRoot({ children }: { children: ReactNode }) {
  const { row, selected } = useChangeRow();
  return (
    <div
      className={`flex w-full items-center gap-1.5 px-2 py-0.5 text-sm ${
        selected ? "bg-accentMuted" : "hover:bg-surfaceHover"
      }`}
      title={row.entry.path}
    >
      {children}
    </div>
  );
}

/** The path, as the button that opens the file in the viewer. */
function ChangeRowOpen() {
  const { row, onOpen } = useChangeRow();
  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className="flex min-w-0 flex-1 items-baseline text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
    >
      <ChangeRowPath />
    </button>
  );
}

export const ChangeRow = Object.assign(ChangeRowRoot, {
  Open: ChangeRowOpen,
  Path: ChangeRowPath,
  State: ChangeRowState,
  Actions: ChangeRowActions,
});
