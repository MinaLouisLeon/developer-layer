import { useEffect, useRef, useState } from "react";

import type { GitBlameLine } from "@/Types";
import { useTransport } from "@/context/TransportContext";
import { useSelection } from "@/features/workbench/context/SelectionContext";
import { describeFailure } from "@/lib/transportError";

import type { BlameState } from "../types";

const IDLE: BlameState = { byLine: new Map(), loading: false, error: null };

/**
 * Per-line authorship for the open file.
 *
 * **On demand only.** Blame is the most expensive read on the transport, and
 * nothing asks for it because a file was opened - `active` is the gutter's own
 * toggle, and turning it off stops the request mattering: a slow answer that
 * arrives after the toggle, or after the file changed, is dropped rather than
 * rendered against the wrong document.
 */
export function useBlame(active: boolean): BlameState {
  const transport = useTransport();
  const { selected } = useSelection();
  const [state, setState] = useState<BlameState>(IDLE);

  const path = selected?.path ?? null;
  const latest = useRef(0);

  useEffect(() => {
    if (!active || !path) {
      latest.current += 1;
      setState(IDLE);
      return;
    }

    const ticket = (latest.current += 1);
    setState({ ...IDLE, loading: true });

    void (async () => {
      try {
        const blame = await transport.git.blame(path);
        if (ticket !== latest.current) return;
        setState({ byLine: byLine(blame.lines), loading: false, error: null });
      } catch (failure) {
        if (ticket !== latest.current) return;
        setState({ ...IDLE, error: describeFailure(failure) });
      }
    })();
  }, [active, path, transport]);

  return state;
}

/** A lookup, so the gutter does no searching per line. */
function byLine(lines: GitBlameLine[]): ReadonlyMap<number, GitBlameLine> {
  return new Map(lines.map((entry) => [entry.line, entry]));
}
