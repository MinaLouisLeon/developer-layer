import { useEffect } from "react";
import type { RefObject } from "react";

import type { PtySize } from "@/Types";

/**
 * Keeps the terminal grid matched to its container.
 *
 * Only refits: the resulting `onResize` from xterm is what tells the pty, so
 * there is one path from "the pane changed size" to "the shell was told".
 * Refits are coalesced to one per frame so dragging a splitter does not fire
 * hundreds of ioctls.
 */
export function useTerminalResize(
  ready: boolean,
  container: RefObject<HTMLDivElement | null>,
  fit: () => PtySize,
): void {
  useEffect(() => {
    const parent = container.current;
    if (!ready || !parent) return;

    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fit());
    });
    observer.observe(parent);
    fit();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [ready, container, fit]);
}
