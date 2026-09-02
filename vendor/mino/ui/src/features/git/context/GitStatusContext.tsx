import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import { useGitStatus } from "../hooks/useGitStatus";
import type { GitStatusContextValue } from "../types";

const GitStatusContext = createContext<GitStatusContextValue | null>(null);

/**
 * One reading of the working tree, shared by everything that decorates itself
 * with it.
 *
 * The tree, the header and anything phase 2 adds all need the same answer at
 * the same moment, and `git status` answers for the whole repository in one
 * call. A provider is what turns that into one call rather than one per row -
 * rows *read* status, they are never handed it.
 *
 * Scoped to the workbench, not the app: there is nothing for git to say while
 * the start screen is up, and a session that closes should take its status
 * with it.
 */
export function GitStatusProvider({ children }: { children: ReactNode }) {
  const status = useGitStatus();
  return (
    <GitStatusContext.Provider value={status}>
      {children}
    </GitStatusContext.Provider>
  );
}

export function useGitStatusContext(): GitStatusContextValue {
  const status = useContext(GitStatusContext);
  if (!status) {
    throw new Error(
      "useGitStatusContext must be used inside a GitStatusProvider",
    );
  }
  return status;
}
