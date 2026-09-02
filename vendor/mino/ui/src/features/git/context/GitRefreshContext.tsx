import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";

/**
 * "Git changed the working tree" - one event, every pane subscribes.
 *
 * ## Why this exists
 *
 * Until phase 4 every git call changed the *index* or nothing at all: staging
 * a file, writing a commit, reading a diff. None of them altered the bytes on
 * disk under the tree, the viewer or the search results, so each pane could
 * own its own refresh policy and never be wrong.
 *
 * A checkout does alter them. So does a stash push, and so does a stash pop.
 * After one, some open paths hold different content and some are not there at
 * all - and *every* pane with state keyed by path is stale at the same moment.
 *
 * The shape that solves it is one event rather than four policies. Each pane
 * says what "the working tree changed underneath me" means for it:
 *
 * | Pane | What it does |
 * | --- | --- |
 * | File tree | Re-reads every folder it has loaded, keeping expansion |
 * | Viewer | Re-reads the open file, and says so if it is gone |
 * | Search | Clears its results - they name paths that may not exist |
 * | Source control | Full status re-read |
 *
 * The alternative - each pane watching for a checkout itself - would be four
 * places to get the same thing right, and the one that was forgotten would
 * show stale content with no way for the reader to tell.
 *
 * ## What it deliberately is not
 *
 * It is **not a message bus**. There is no payload, no reason code and no
 * ordering guarantee, because no subscriber needs one: every pane's answer to
 * this event is "read again from git", which is the same answer whatever
 * caused it. A reason code would be a thing to keep in agreement across five
 * files for no behaviour that depends on it.
 *
 * It is **not a guard**. An unsaved editor draft has to be warned about
 * *before* a checkout, not repaired after one - git knows nothing about a
 * buffer that was never written. That warning lives in
 * `features/source-control/hooks/useCheckoutGuard`, in front of the call.
 */
interface GitRefreshValue {
  /** Registers a listener and returns its unsubscribe. */
  subscribe: (listener: () => void) => () => void;
  /**
   * Announces that git has changed the working tree. Called once, after the
   * transport call returns - on failure too, because a call that failed
   * halfway is exactly when the panes must re-read rather than assume.
   */
  notify: () => void;
}

const GitRefreshContext = createContext<GitRefreshValue | null>(null);

export function GitRefreshProvider({ children }: { children: ReactNode }) {
  // A ref, not state: subscribing must not re-render the provider, or every
  // pane would re-render each time another pane mounted.
  const listeners = useRef(new Set<() => void>());

  const subscribe = useCallback((listener: () => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const notify = useCallback(() => {
    // Copied before iterating: a listener that unsubscribes itself while the
    // event is being delivered would otherwise mutate the set mid-loop.
    for (const listener of [...listeners.current]) listener();
  }, []);

  const value = useMemo(() => ({ subscribe, notify }), [subscribe, notify]);
  return (
    <GitRefreshContext.Provider value={value}>
      {children}
    </GitRefreshContext.Provider>
  );
}

function useGitRefreshContext(): GitRefreshValue {
  const refresh = useContext(GitRefreshContext);
  if (!refresh) {
    throw new Error(
      "useGitRefresh must be used inside a GitRefreshProvider",
    );
  }
  return refresh;
}

/**
 * Announces a working-tree change. For the callers that *cause* one - the
 * branch picker and the stash section.
 */
export function useNotifyGitRefresh(): () => void {
  return useGitRefreshContext().notify;
}

/**
 * Runs `onRefresh` whenever git changes the working tree. For the panes that
 * have to cope with one.
 *
 * The listener is kept in a ref so a caller can pass an inline function
 * without resubscribing on every render - which would be a subscribe and
 * unsubscribe per keystroke in the search pane.
 */
export function useGitRefresh(onRefresh: () => void): void {
  const { subscribe } = useGitRefreshContext();
  const latest = useRef(onRefresh);
  latest.current = onRefresh;

  useEffect(() => subscribe(() => latest.current()), [subscribe]);
}
