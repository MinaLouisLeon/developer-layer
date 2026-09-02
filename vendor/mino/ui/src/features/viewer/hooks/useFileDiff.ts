import { useEffect, useRef, useState } from "react";

import { useTransport } from "@/context/TransportContext";
import { useSelection } from "@/features/workbench/context/SelectionContext";
import { describeFailure } from "@/lib/transportError";

import { useViewerMode } from "../context/ViewerModeContext";
import type { FileDiffState } from "../types";

const IDLE: FileDiffState = {
  status: "idle",
  file: null,
  truncated: false,
  error: null,
};

/**
 * The diff for whatever the viewer has open.
 *
 * Asked for only while diff mode is showing. Nothing here runs because a file
 * was opened - the editor is the default, and a diff on every selection would
 * be a git call per click.
 *
 * Which diff depends on where the file was opened from. A commit selected in
 * the history list asks what *that commit* did to it; anything else asks what
 * the working tree has. They are different questions, and `commitDiff` answers
 * the first one even for a root commit.
 */
export function useFileDiff(active: boolean): FileDiffState {
  const transport = useTransport();
  const { selected } = useSelection();
  const { commit } = useViewerMode();
  const [state, setState] = useState<FileDiffState>(IDLE);

  const path = selected?.path ?? null;
  /** Sequence number of the most recent request; older answers are ignored. */
  const latest = useRef(0);

  useEffect(() => {
    if (!active || !path) {
      latest.current += 1;
      setState(IDLE);
      return;
    }

    const ticket = (latest.current += 1);
    setState({ ...IDLE, status: "loading" });

    void (async () => {
      try {
        const diff = commit
          ? await transport.git.commitDiff(commit, path)
          : await transport.git.diff({ path, staged: false, against: null });
        if (ticket !== latest.current) return;
        setState({
          status: "ready",
          // One path in, so at most one file out. An empty answer means the
          // file has no changes, which the view renders as a quiet state
          // rather than as an error.
          file: diff.files[0] ?? null,
          truncated: diff.truncated,
          error: null,
        });
      } catch (failure) {
        if (ticket !== latest.current) return;
        setState({
          status: "error",
          file: null,
          truncated: false,
          error: describeFailure(failure),
        });
      }
    })();
  }, [active, path, commit, transport]);

  return state;
}
