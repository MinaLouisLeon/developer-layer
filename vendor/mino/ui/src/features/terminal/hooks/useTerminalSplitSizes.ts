import { useCallback, useEffect, useRef, useState } from "react";

/** Smallest share a column may be dragged to, in percent. */
const MIN_SHARE = 10;

/** Even columns for `count` terminals. */
function evenShares(count: number): number[] {
  return Array.from({ length: count }, () => 100 / count);
}

/**
 * Column widths for the split terminals, and the drag that changes them.
 *
 * This is hand-rolled rather than `react-resizable-panels`, which the rest of
 * the workbench uses, for one reason: that library does not render panels
 * added to a group after mount, and its documented answer is to re-key the
 * group. Re-keying unmounts the children - which here would tear down every
 * running shell just because a new one was opened. Splitting must never
 * restart the terminal you were already working in, so the layout is done in
 * flex and the terminals simply stay mounted.
 */
export function useTerminalSplitSizes(count: number) {
  const [sizes, setSizes] = useState<number[]>(() => evenShares(count));
  const row = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ index: number; startX: number; before: number[] } | null>(null);

  // Adding or closing a terminal redistributes evenly. Anything cleverer
  // would have to guess which column the user wanted the space to come from.
  useEffect(() => {
    setSizes((current) => (current.length === count ? current : evenShares(count)));
  }, [count]);

  const onPointerMove = useCallback((event: PointerEvent) => {
    const state = drag.current;
    const element = row.current;
    if (!state || !element) return;

    const width = element.getBoundingClientRect().width;
    if (width <= 0) return;

    // The two columns either side of the handle trade width; the rest hold
    // still, so a drag is local rather than reflowing the whole row.
    const deltaPercent = ((event.clientX - state.startX) / width) * 100;
    const left = state.before[state.index];
    const right = state.before[state.index + 1];
    const room = left + right;
    const nextLeft = Math.min(Math.max(left + deltaPercent, MIN_SHARE), room - MIN_SHARE);

    const next = [...state.before];
    next[state.index] = nextLeft;
    next[state.index + 1] = room - nextLeft;
    setSizes(next);
  }, []);

  const endDrag = useCallback(() => {
    drag.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
  }, [onPointerMove]);

  const startDrag = useCallback(
    (index: number, clientX: number) => {
      drag.current = { index, startX: clientX, before: sizes };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", endDrag);
    },
    [sizes, onPointerMove, endDrag],
  );

  /** Keyboard equivalent of the drag, so the handle is not mouse-only. */
  const nudge = useCallback((index: number, percent: number) => {
    setSizes((current) => {
      const left = current[index];
      const right = current[index + 1];
      if (left === undefined || right === undefined) return current;
      const room = left + right;
      const nextLeft = Math.min(Math.max(left + percent, MIN_SHARE), room - MIN_SHARE);
      const next = [...current];
      next[index] = nextLeft;
      next[index + 1] = room - nextLeft;
      return next;
    });
  }, []);

  // A drag in progress when the pane unmounts would leave listeners on window.
  useEffect(() => endDrag, [endDrag]);

  return { row, sizes, startDrag, nudge };
}
