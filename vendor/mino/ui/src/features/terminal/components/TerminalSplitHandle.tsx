import { TERMINAL_COPY } from "../messages";
import type { TerminalSplitHandleProps } from "../types";

/** How much one arrow press moves the divider, in percent. */
const NUDGE = 4;

/**
 * The divider between two terminals.
 *
 * A separator with arrow-key support rather than a bare `<div>` with a mouse
 * handler: a split you can only resize with a pointer is a split half the
 * users cannot resize.
 */
export function TerminalSplitHandle({ index, onStart, onNudge }: TerminalSplitHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={TERMINAL_COPY.splitHandle}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        onStart(index, event.clientX);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onNudge(index, -NUDGE);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          onNudge(index, NUDGE);
        }
      }}
      className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-accentMuted focus:outline-none focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-accentStrong"
    />
  );
}
