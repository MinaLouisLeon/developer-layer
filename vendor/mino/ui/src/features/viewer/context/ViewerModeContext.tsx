import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { useSelection } from "@/features/workbench/context/SelectionContext";

import type { ViewerModeContextValue, ViewerMode } from "../types";

const ViewerModeContext = createContext<ViewerModeContextValue | null>(null);

/**
 * What the viewer is showing, beside *which file* it is showing.
 *
 * Kept apart from `SelectionContext` on purpose. Selection answers "which
 * file", and every pane that can open one writes to it. This answers "as its
 * contents, as a diff, or with blame" - a question only the viewer asks, and
 * one the history list needs to be able to set.
 *
 * Mode is **not** persisted and does not belong in `usePersistentState`: it is
 * about the file in front of you, not a layout preference, and restoring diff
 * mode for a file that no longer has changes would be a puzzle rather than a
 * convenience.
 */
export function ViewerModeProvider({ children }: { children: ReactNode }) {
  const { select } = useSelection();
  const [mode, setMode] = useState<ViewerMode>("file");
  const [blame, setBlame] = useState(false);
  const [commit, setCommit] = useState<string | null>(null);

  /** Opening a file normally leaves history behind. */
  const chooseMode = useCallback((next: ViewerMode) => {
    setMode(next);
    if (next === "file") setCommit(null);
  }, []);

  /**
   * The history list's way in: show this file as it changed in this commit.
   *
   * Sets the selection too, so the rest of the app - the tree's highlight, the
   * viewer's title - agrees about which file is open. One selection concept,
   * as the tree and the search results already use.
   */
  const showCommitFile = useCallback(
    (revision: string, path: string, name: string) => {
      setCommit(revision);
      setMode("diff");
      setBlame(false);
      select({
        path,
        name,
        kind: "file",
        size: 0,
        modifiedMs: null,
        readonly: true,
        hidden: name.startsWith("."),
      });
    },
    [select],
  );

  const value = useMemo(
    () => ({
      mode,
      setMode: chooseMode,
      blame,
      toggleBlame: () => setBlame((on) => !on),
      commit,
      showCommitFile,
      clearCommit: () => setCommit(null),
    }),
    [mode, chooseMode, blame, commit, showCommitFile],
  );

  return (
    <ViewerModeContext.Provider value={value}>
      {children}
    </ViewerModeContext.Provider>
  );
}

export function useViewerMode(): ViewerModeContextValue {
  const value = useContext(ViewerModeContext);
  if (!value) {
    throw new Error("useViewerMode must be used inside a ViewerModeProvider");
  }
  return value;
}
