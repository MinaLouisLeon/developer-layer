import { useCallback, useState } from "react";

import { useTransport } from "@/context/TransportContext";
import { describeFailure } from "@/lib/transportError";
import { openExternal } from "@/lib/openExternal";

import { useGitHubContext } from "../context/GitHubContext";
import { ask } from "../query";

/** What the viewer header's GitHub command knows. */
export interface OpenOnGitHubState {
  /** False whenever there is nothing to open, so the button is not offered. */
  available: boolean;
  opening: boolean;
  error: string | null;
  dismiss: () => void;
  open: () => void;
}

/**
 * #19: this file, this line, on github.com.
 *
 * Two steps, and they are two on purpose. Rust asks `gh` where the file lives
 * and answers with a **URL**; this hands that URL to the operating system's
 * browser through the desktop opener. A transport method called `query` that
 * launched a browser as a side effect would be a surprise, and a page that
 * navigated itself to an address GitHub supplied would be a page somebody else
 * can steer.
 *
 * The line is read at the moment the button is pressed, from the editor, by
 * `currentLine`. Nothing tracks the cursor before then.
 *
 * The branch is the one that is checked out, not the repository's default. A
 * link to the line you are looking at, on a branch that does not have your
 * change, is a link to the wrong line.
 */
export function useOpenOnGitHub(
  path: string | null,
  currentLine: () => number | null,
): OpenOnGitHubState {
  const transport = useTransport();
  const { state, branch, branchKnown } = useGitHubContext();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `branchKnown`, not `branch !== null`: a detached HEAD has no branch and
  // the command still applies - `gh` falls back to the default branch, which
  // is the only address there is. What must not happen is building a link
  // during the window before git has answered, because that link would name
  // the default branch while the reader is on another one, and it would look
  // right.
  const available = state === "ready" && path !== null && branchKnown;

  const open = useCallback(() => {
    if (path === null) return;
    setOpening(true);
    setError(null);
    void (async () => {
      try {
        const url = await ask(
          transport.github,
          {
            kind: "browseUrl",
            detail: { path, line: currentLine(), branch },
          },
          "url",
        );
        await openExternal(url);
      } catch (failure) {
        setError(describeFailure(failure));
      } finally {
        setOpening(false);
      }
    })();
  }, [transport, path, currentLine, branch]);

  return {
    available,
    opening,
    error,
    dismiss: useCallback(() => setError(null), []),
    open,
  };
}
