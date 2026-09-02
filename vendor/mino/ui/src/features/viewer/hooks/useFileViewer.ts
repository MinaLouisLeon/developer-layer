import { useCallback, useEffect, useRef, useState } from "react";

import { useTransport } from "@/context/TransportContext";
import { useGitRefresh } from "@/features/git/context/GitRefreshContext";
import { useSelection } from "@/features/workbench/context/SelectionContext";
import { toTransportError, transportErrorMessage } from "@/lib/transportError";

import type { ViewerState } from "../types";

const EMPTY: ViewerState = {
  status: "empty",
  payload: null,
  error: null,
  guarded: false,
};

/** Guard failures are expected outcomes, not faults; they read differently. */
const GUARD_KINDS = new Set(["tooLarge", "binaryFile"]);

/**
 * Loads whatever the tree selected. The size ceiling and the binary sniff are
 * enforced in the transport, so this hook only has to present their verdict.
 */
export function useFileViewer(): ViewerState & { path: string | null; revision: number } {
  const { selected } = useSelection();
  const transport = useTransport();
  const [state, setState] = useState<ViewerState>(EMPTY);
  // Bumped once per completed read. The editor keys its view on this so a new
  // file rebuilds the document while typing does not.
  const revision = useRef(0);
  // Bumped when git changes the working tree, to re-run the read below for the
  // same selection. A file that is gone after a checkout reports the
  // transport's own "no such file" rather than going on showing stale text.
  const [nonce, setNonce] = useState(0);

  useGitRefresh(useCallback(() => setNonce((current) => current + 1), []));

  useEffect(() => {
    if (!selected || selected.kind === "directory") {
      setState(EMPTY);
      return;
    }
    let cancelled = false;
    setState({ ...EMPTY, status: "loading" });

    transport
      .readFile(selected.path)
      .then((payload) => {
        if (cancelled) return;
        revision.current += 1;
        setState({ status: "ready", payload, error: null, guarded: false });
      })
      .catch((raw: unknown) => {
        if (cancelled) return;
        const error = toTransportError(raw);
        setState({
          status: "error",
          payload: null,
          error: transportErrorMessage(error),
          guarded: GUARD_KINDS.has(error.kind),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [selected, transport, nonce]);

  return { ...state, path: selected?.path ?? null, revision: revision.current };
}
