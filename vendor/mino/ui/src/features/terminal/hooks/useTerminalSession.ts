import { useEffect, useRef, useState } from "react";

import type { PtyEvent, PtySessionId, Unsubscribe } from "@/Types";
import { useTransport } from "@/context/TransportContext";
import { useSessionContext } from "@/features/workbench/context/SessionContext";
import { describeFailure } from "@/lib/transportError";

import type { TerminalSessionState } from "../types";
import { useTerminalResize } from "./useTerminalResize";
import { useXterm } from "./useXterm";

const IDLE: TerminalSessionState = {
  session: null,
  error: null,
  exit: null,
  fallbackShell: null,
};

/**
 * Binds one pty session to one xterm instance.
 *
 * Teardown closes the session on the transport, so unmounting the pane - or
 * closing the window - never leaves a shell running.
 */
export function useTerminalSession() {
  const transport = useTransport();
  const { connection, shellProbe } = useSessionContext();
  const { container, terminal, fit, ready } = useXterm();
  const [state, setState] = useState<TerminalSessionState>(IDLE);
  const openSession = useRef<PtySessionId | null>(null);

  useTerminalResize(ready, container, fit);

  useEffect(() => {
    const term = terminal.current;
    if (!ready || !connection || !term) return;

    let cancelled = false;
    let unsubscribe: Unsubscribe | null = null;
    const disposers: Array<() => void> = [];
    setState(IDLE);

    const onEvent = (event: PtyEvent) => {
      // Insurance against a frame queued behind teardown.
      if (cancelled) return;
      if (event.type === "output") term.write(event.data);
      if (event.type === "exit") {
        setState((current) => ({ ...current, exit: event.data }));
      }
      if (event.type === "error") {
        setState((current) => ({ ...current, error: event.data }));
      }
    };

    void (async () => {
      try {
        const session = await transport.openPty({
          cwd: connection.root,
          size: fit(),
        });
        if (cancelled) {
          void transport.closePty(session.id).catch(() => undefined);
          return;
        }
        openSession.current = session.id;
        setState({
          session,
          error: null,
          exit: null,
          // The probe names the shell the way the target would; the raw
          // program path is the fallback when there is no probe.
          fallbackShell: session.fellBack
            ? (shellProbe?.fallbackLabel ?? session.program)
            : null,
        });

        unsubscribe = await transport.onPtyEvent(session.id, onEvent);
        if (cancelled) {
          // Teardown already ran and could not see this listener, so detach it
          // here. The session itself was closed by the cleanup.
          unsubscribe();
          return;
        }

        const data = term.onData((chunk) => {
          void transport.writePty(session.id, chunk).catch((error: unknown) => {
            setState((current) => ({ ...current, error: describeFailure(error) }));
          });
        });
        const resize = term.onResize(({ cols, rows }) => {
          void transport.resizePty(session.id, { cols, rows }).catch(() => undefined);
        });
        disposers.push(() => data.dispose(), () => resize.dispose());
      } catch (error) {
        if (!cancelled) {
          setState({ ...IDLE, error: describeFailure(error) });
        }
      }
    })();

    return () => {
      cancelled = true;
      disposers.forEach((dispose) => dispose());
      unsubscribe?.();
      const id = openSession.current;
      openSession.current = null;
      if (id) void transport.closePty(id).catch(() => undefined);
    };
  }, [ready, connection, shellProbe, transport, terminal, fit]);

  return { ...state, container };
}
