import { useEffect, type ReactNode } from "react";

import { render } from "@testing-library/react";

import type { ConnectionTarget, TransportClient } from "@/Types";
import { TransportProvider } from "@/context/TransportContext";
import { GitRefreshProvider } from "@/features/git/context/GitRefreshContext";
import { GitStatusProvider } from "@/features/git/context/GitStatusContext";
import { GitHubProvider } from "@/features/github/context/GitHubContext";
import { DraftsProvider } from "@/features/viewer/context/DraftsContext";
import { ViewerModeProvider } from "@/features/viewer/context/ViewerModeContext";
import { SelectionProvider } from "@/features/workbench/context/SelectionContext";
import {
  SessionProvider,
  useSessionContext,
} from "@/features/workbench/context/SessionContext";

function Connected({
  target,
  children,
}: {
  target: ConnectionTarget;
  children: ReactNode;
}) {
  const { connect, connection } = useSessionContext();
  useEffect(() => {
    void connect(target);
  }, [connect, target]);
  return connection ? <>{children}</> : null;
}

/** A remote session, for panes that behave differently off this machine. */
export function sshTarget(root: string): ConnectionTarget {
  return {
    kind: "ssh",
    detail: { host: "host.invalid", port: 22, user: "nu", root, identityPath: null },
  };
}

/**
 * Renders a pane inside a live session backed by a fake transport, which is
 * how a pane is exercised without a Tauri runtime.
 *
 * `target` defaults to a local session. Pass `sshTarget(root)` for the cases
 * where being remote is the point.
 *
 * `GitStatusProvider` is here because the tree rows and the header read it,
 * and because the fake defaults to "not a repository" - which means every
 * existing test goes on asserting the no-git rendering without saying so.
 *
 * `GitRefreshProvider` wraps it for the same reason it does in `Workbench`:
 * the status, the tree, the viewer and search all subscribe to one
 * "git changed the working tree" event, and a pane rendered without it would
 * be a pane the harness could not exercise a checkout against.
 *
 * `GitHubProvider` is here because the viewer header carries the "open on
 * github.com" command, and because the fake's probe defaults to `unsupported`
 * - which means every existing test goes on asserting the no-GitHub rendering
 * without saying so, exactly as `GitStatusProvider` does for git.
 */
export function renderConnected(
  ui: ReactNode,
  client: TransportClient,
  root = "/root",
  target: ConnectionTarget = { kind: "local", detail: { root } },
) {
  return render(
    <TransportProvider client={client}>
      <SessionProvider>
        <DraftsProvider>
          <GitRefreshProvider>
            <GitStatusProvider>
              <GitHubProvider>
                <SelectionProvider>
                  <ViewerModeProvider>
                    <Connected target={target}>{ui}</Connected>
                  </ViewerModeProvider>
                </SelectionProvider>
              </GitHubProvider>
            </GitStatusProvider>
          </GitRefreshProvider>
        </DraftsProvider>
      </SessionProvider>
    </TransportProvider>,
  );
}

/** Renders providers only, for hooks that do not need a connection. */
export function withProviders(client: TransportClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <TransportProvider client={client}>
        <SessionProvider>
          <DraftsProvider>
            <GitRefreshProvider>
              <GitStatusProvider>
                <GitHubProvider>
                  <SelectionProvider>
                    <ViewerModeProvider>{children}</ViewerModeProvider>
                  </SelectionProvider>
                </GitHubProvider>
              </GitStatusProvider>
            </GitRefreshProvider>
          </DraftsProvider>
        </SessionProvider>
      </TransportProvider>
    );
  };
}
