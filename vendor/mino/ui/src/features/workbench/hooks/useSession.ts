import { useCallback, useEffect, useState } from "react";

import type { ConnectionTarget } from "@/Types";
import { useTransport } from "@/context/TransportContext";
import { describeFailure } from "@/lib/transportError";

import type { SessionContextValue, SessionState } from "../types";

const IDLE: SessionState = {
  status: "idle",
  connection: null,
  target: null,
  shellProbe: null,
  error: null,
};

/**
 * Returns `target` with a different root.
 *
 * Written as a switch on `kind` so that adding a transport is a compile error
 * here rather than a silently unchanged root.
 */
function withRoot(target: ConnectionTarget, root: string): ConnectionTarget {
  switch (target.kind) {
    case "local":
      return { kind: "local", detail: { ...target.detail, root } };
    case "ssh":
      return { kind: "ssh", detail: { ...target.detail, root } };
    case "remoteAgent":
      return { kind: "remoteAgent", detail: { ...target.detail, root } };
  }
}

/**
 * Owns the connection lifecycle for the whole window: one target at a time,
 * torn down on unmount so no pty session outlives the app.
 */
export function useSession(): SessionContextValue {
  const transport = useTransport();
  const [state, setState] = useState<SessionState>(IDLE);

  const connect = useCallback(
    async (target: ConnectionTarget) => {
      setState({ ...IDLE, status: "connecting" });
      try {
        const connection = await transport.connect(target);
        // A failed probe is not a failed connection: the terminal degrades to
        // the platform shell and says so.
        const shellProbe = await transport.probeShell().catch(() => null);
        setState({
          status: "connected",
          connection,
          target,
          shellProbe,
          error: null,
        });
      } catch (error) {
        setState({ ...IDLE, status: "error", error: describeFailure(error) });
      }
    },
    [transport],
  );

  const disconnect = useCallback(async () => {
    await transport.disconnect().catch(() => undefined);
    setState(IDLE);
  }, [transport]);

  const changeFolder = useCallback(
    async (root: string) => {
      // Re-rooting is a connect to the same target with a new root. The SSH
      // transport recognises the unchanged endpoint and reuses the live
      // connection rather than authenticating again.
      const target = state.target;
      if (!target) return;
      await connect(withRoot(target, root));
    },
    [connect, state.target],
  );

  useEffect(
    () => () => {
      void transport.disconnect().catch(() => undefined);
    },
    [transport],
  );

  return { ...state, connect, disconnect, changeFolder };
}
