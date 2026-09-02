import type { RefObject } from "react";

import type { PtyExit, PtySession, PtySize } from "@/Types";

export interface TerminalSessionState {
  session: PtySession | null;
  /** Friendly copy for a failure that stopped the session opening. */
  error: string | null;
  /** Set once the shell exits; the pane then offers a reason, not a blank box. */
  exit: PtyExit | null;
  /**
   * Name of the shell spawned because `nu` was missing, e.g. `zsh`. Null when
   * Nushell started normally.
   */
  fallbackShell: string | null;
}

export interface TerminalInstanceProps {
  /** False for the last terminal: the pane always keeps one. */
  closable: boolean;
  onClose: () => void;
}

export interface TerminalSplitHandleProps {
  /** Index of the gap: it sits between column `index` and `index + 1`. */
  index: number;
  onStart: (index: number, clientX: number) => void;
  onNudge: (index: number, percent: number) => void;
}

export interface XtermHandle {
  container: RefObject<HTMLDivElement | null>;
  /** Resizes the terminal to its container and returns the new grid size. */
  fit: () => PtySize;
  ready: boolean;
}
