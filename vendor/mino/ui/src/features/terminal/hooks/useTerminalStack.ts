import { useCallback, useState } from "react";

/**
 * How many shells one pane will hold.
 *
 * Each split is a real process on the target, not a tab in a buffer, so this
 * is a deliberate ceiling rather than a UI limit: four side by side is already
 * narrow at a typical pane width, and past that the columns stop being usable.
 */
export const MAX_TERMINALS = 4;

let counter = 0;
/** Stable per-instance key. Not the pty id - the transport issues those. */
function nextId(): string {
  counter += 1;
  return `terminal-${counter}`;
}

/**
 * Owns which terminals exist, and nothing else.
 *
 * A terminal's own state - its pty, its output, its exit - belongs to the
 * instance that renders it, so closing one here unmounts it and its session is
 * torn down by the same cleanup that handles closing the window.
 */
export function useTerminalStack() {
  const [ids, setIds] = useState<string[]>(() => [nextId()]);

  const add = useCallback(() => {
    setIds((current) =>
      current.length >= MAX_TERMINALS ? current : [...current, nextId()],
    );
  }, []);

  const close = useCallback((id: string) => {
    // The pane always holds at least one terminal: an empty terminal pane is
    // a dead rectangle, and closing the last one has no obvious way back.
    setIds((current) =>
      current.length <= 1 ? current : current.filter((entry) => entry !== id),
    );
  }, []);

  return {
    ids,
    add,
    close,
    canAdd: ids.length < MAX_TERMINALS,
    canClose: ids.length > 1,
  };
}
