import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import { useGitHubProbe } from "../hooks/useGitHubProbe";
import type { GitHubContextValue } from "../types";

const GitHubContext = createContext<GitHubContextValue | null>(null);

/**
 * One probe for the whole window, shared by everything that needs to know
 * whether GitHub is reachable here.
 *
 * A provider rather than a hook per surface, for the same reason
 * `GitStatusProvider` is one: the pane's four sections and the viewer's
 * "open on github.com" command all need the same answer at the same moment,
 * and it is one `gh` call. Sections *read* the probe; they are never handed it
 * and never ask again themselves.
 *
 * Scoped to the workbench rather than the app - there is no repository to ask
 * about while the start screen is up, and a session that closes should take
 * its probe with it.
 *
 * It sits **inside** `GitStatusProvider` because it reads the branch from
 * there. Two readings of the same branch could disagree, and the workbench
 * header is the one already showing it.
 */
export function GitHubProvider({ children }: { children: ReactNode }) {
  const github = useGitHubProbe();
  return (
    <GitHubContext.Provider value={github}>{children}</GitHubContext.Provider>
  );
}

export function useGitHubContext(): GitHubContextValue {
  const github = useContext(GitHubContext);
  if (!github) {
    throw new Error("useGitHubContext must be used inside a GitHubProvider");
  }
  return github;
}
