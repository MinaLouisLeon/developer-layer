import { useCallback, useEffect, useRef, useState } from "react";

import type { GitEntry } from "@/Types";
import { useTransport } from "@/context/TransportContext";
import { useSessionContext } from "@/features/workbench/context/SessionContext";
import { toTransportError, transportErrorMessage } from "@/lib/transportError";

import { useGitRefresh } from "../context/GitRefreshContext";
import type { GitStatusContextValue, GitStatusState } from "../types";

/**
 * How long a burst of refresh requests is allowed to coalesce into one call.
 *
 * Status is not free, and saving a file, switching windows and expanding a
 * folder can all land within a few hundred milliseconds of each other. This is
 * the whole of the refresh policy: there is no timer anywhere, because a
 * workbench that polls git is a workbench that fights the terminal beside it.
 */
const COALESCE_MS = 250;

const EMPTY: GitStatusState = {
  availability: "loading",
  repository: null,
  entries: new Map(),
  dirty: false,
  error: null,
  truncated: false,
};

/**
 * Reads the working tree for the open session.
 *
 * The shape of the load is the interesting part. `repository()` is asked
 * first, and its three possible answers are three different states: a
 * repository, `null` for "this folder is not one", or a failure. Only the
 * first is followed by a `status()` call, which is what makes a folder that is
 * not a checkout cost exactly one cheap call and produce no error at all.
 *
 * Every request carries a sequence number so a slow early answer that lands
 * after a fast later one is dropped rather than overwriting it.
 */
export function useGitStatus(): GitStatusContextValue {
  const transport = useTransport();
  const { connection } = useSessionContext();
  const root = connection?.root ?? null;

  const [state, setState] = useState<GitStatusState>(EMPTY);
  const [nonce, setNonce] = useState(0);
  const latest = useRef(0);

  const refresh = useCallback(() => setNonce((current) => current + 1), []);

  useEffect(() => {
    if (!root) {
      latest.current += 1;
      setState(EMPTY);
      return;
    }

    const ticket = (latest.current += 1);
    const timer = window.setTimeout(() => {
      void (async () => {
        const next = await read(transport.git);
        if (ticket !== latest.current) return;
        setState(next);
      })();
    }, COALESCE_MS);

    return () => window.clearTimeout(timer);
  }, [root, nonce, transport]);

  // The other half of the refresh policy. Anything can have happened to the
  // working tree while the window was in the background - a rebase, a pull, a
  // build - and coming back to it is the moment that matters. A timer would
  // ask a thousand times to catch the same change once.
  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  // And the third: a checkout or a stash this app made itself. Those are the
  // changes it does not have to guess about, so it does not wait for a focus
  // event to find out.
  useGitRefresh(refresh);

  return { ...state, refresh };
}

/** The two calls, and what each answer means. */
async function read(
  git: ReturnType<typeof useTransport>["git"],
): Promise<GitStatusState> {
  let repository;
  try {
    repository = await git.repository();
  } catch (failure) {
    return failed(failure);
  }
  // Not a repository. Not an error, and not worth a second call: most folders
  // are not checkouts and the UI stays quiet for them.
  if (!repository) {
    return { ...EMPTY, availability: "notARepository" };
  }

  try {
    const status = await git.status();
    return {
      availability: "ready",
      repository: status.repository,
      entries: byPath(status.entries),
      dirty: status.entries.some(
        (entry) => isDirty(entry.index) || isDirty(entry.worktree),
      ),
      error: null,
      truncated: status.truncated,
    };
  } catch (failure) {
    // The repository is real even when the status call failed, so the header
    // keeps its branch name rather than blanking on a transient error.
    return { ...failed(failure), repository };
  }
}

function failed(failure: unknown): GitStatusState {
  const error = toTransportError(failure);
  return {
    ...EMPTY,
    // `unimplemented` is the transport saying it has no git surface at all,
    // which is a permanent condition for the session rather than a failure to
    // report every time. Everything else is worth a sentence.
    availability: error.kind === "unimplemented" ? "absent" : "failed",
    error: error.kind === "unimplemented" ? null : transportErrorMessage(error),
  };
}

function byPath(entries: GitEntry[]): ReadonlyMap<string, GitEntry> {
  return new Map(entries.map((entry) => [entry.path, entry]));
}

/** Mirrors `GitFileState::is_dirty` in Rust: a clean or ignored side is not. */
function isDirty(state: GitEntry["index"]): boolean {
  return state !== "unmodified" && state !== "ignored";
}
