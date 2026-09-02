import { Notice } from "@/components/ui";
import { basename } from "@/lib/path";

import { useTerminalSession } from "../hooks/useTerminalSession";
import { TERMINAL_COPY } from "../messages";
import type { TerminalInstanceProps } from "../types";

/**
 * One shell: its own pty, its own xterm, its own notices.
 *
 * Everything a terminal knows lives here rather than in the pane, so a split
 * is a second instance of this component and nothing has to be shared between
 * them. Unmounting one closes exactly one session.
 */
export function TerminalInstance({ closable, onClose }: TerminalInstanceProps) {
  const { container, session, error, exit, fallbackShell } = useTerminalSession();
  const hasNotice = Boolean(fallbackShell || error || exit);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surfaceSunken">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-2 py-1">
        <span className="min-w-0 truncate text-xs text-textFaint">
          {session ? basename(session.program) : TERMINAL_COPY.starting}
        </span>
        {closable ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={TERMINAL_COPY.closeTerminal}
            title={TERMINAL_COPY.closeTerminal}
            className="shrink-0 rounded px-1 text-xs text-textMuted hover:bg-surfaceHover hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
          >
            ✕
          </button>
        ) : null}
      </div>

      {hasNotice ? (
        <div className="flex shrink-0 flex-col gap-1.5 p-2">
          {fallbackShell ? (
            <Notice variant="warning" title={TERMINAL_COPY.fallbackTitle}>
              {TERMINAL_COPY.fallback(fallbackShell)}
            </Notice>
          ) : null}
          {error ? (
            <Notice variant="danger" title={TERMINAL_COPY.errorTitle}>
              {error}
            </Notice>
          ) : null}
          {exit ? (
            <Notice variant="info" title={TERMINAL_COPY.exitTitle}>
              {TERMINAL_COPY.exit(exit.code)}
            </Notice>
          ) : null}
        </div>
      ) : null}

      <div
        ref={container}
        aria-label={TERMINAL_COPY.terminalLabel}
        className="min-h-0 flex-1 p-1"
      />
    </div>
  );
}
