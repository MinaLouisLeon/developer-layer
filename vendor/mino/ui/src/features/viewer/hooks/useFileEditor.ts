import { useCallback, useEffect, useState } from "react";

import { useTransport } from "@/context/TransportContext";
import { useGitStatusContext } from "@/features/git/context/GitStatusContext";
import { toTransportError, transportErrorMessage } from "@/lib/transportError";

import { useDrafts } from "../context/DraftsContext";
import { VIEWER_COPY } from "../messages";
import type { EditorState } from "../types";
import { useFileViewer } from "./useFileViewer";

const IDLE: EditorState = {
  draft: null,
  baseline: null,
  savedModifiedMs: null,
  saving: false,
  saveError: null,
  justSaved: false,
};

/**
 * Editing on top of the loaded file.
 *
 * `baseline` is what is on disk as far as this session knows, so "dirty" is a
 * comparison rather than a flag that can drift out of step with the document.
 *
 * `savedModifiedMs` is the other half of the lost-update guard: it goes with
 * every save, and the transport refuses the write if the file has moved on
 * since. That is what makes saving safe when something else has touched the
 * file - a build, a formatter, or the terminal in the pane below.
 */
export function useFileEditor() {
  const viewer = useFileViewer();
  const transport = useTransport();
  // A save is the one moment the working tree is known to have changed, so it
  // is the one moment worth re-reading it. See `useGitStatus` for why that is
  // an event and not a timer.
  const { refresh: refreshGit } = useGitStatusContext();
  const [state, setState] = useState<EditorState>(IDLE);
  // Shared rather than owned: a discard in the source control panel clears the
  // draft for the file it threw away, so the viewer cannot go on showing text
  // that no longer exists anywhere. See `DraftsContext`.
  const drafts = useDrafts();

  // Loading a file restores its remembered draft if there is one, so
  // switching away mid-edit and coming back does not lose the work.
  useEffect(() => {
    const payload = viewer.payload;
    if (viewer.status !== "ready" || !payload) {
      setState(IDLE);
      return;
    }
    const remembered = drafts.get(payload.path);
    setState({
      ...IDLE,
      draft: remembered?.content ?? payload.content,
      baseline: payload.content,
      savedModifiedMs: payload.modifiedMs,
    });
  }, [viewer.status, viewer.payload, drafts]);

  const onChange = useCallback(
    (draft: string) => {
      setState((current) => {
        if (viewer.path && current.baseline !== null) {
          drafts.set(viewer.path, {
            content: draft,
            baseline: current.baseline,
          });
        }
        return { ...current, draft, justSaved: false };
      });
    },
    [viewer.path, drafts],
  );

  const dirty = state.draft !== null && state.draft !== state.baseline;
  // A binary or oversized file never loaded, so there is nothing to edit.
  const editable = viewer.status === "ready" && viewer.payload !== null;

  const save = useCallback(async () => {
    const path = viewer.path;
    const draft = state.draft;
    if (!path || draft === null || state.saving || draft === state.baseline) return;

    setState((current) => ({ ...current, saving: true, saveError: null }));
    try {
      const entry = await transport.writeFile(path, {
        content: draft,
        expectedModifiedMs: state.savedModifiedMs,
      });
      drafts.clear(path);
      refreshGit();
      setState((current) => ({
        ...current,
        baseline: draft,
        savedModifiedMs: entry.modifiedMs,
        saving: false,
        saveError: null,
        // Only a confirmation if nothing was typed while the write was in
        // flight; that text is still unsaved.
        justSaved: current.draft === draft,
      }));
    } catch (raw: unknown) {
      const error = toTransportError(raw);
      setState((current) => ({
        ...current,
        saving: false,
        justSaved: false,
        saveError:
          error.kind === "conflict" ? VIEWER_COPY.conflict : transportErrorMessage(error),
      }));
    }
  }, [
    transport,
    refreshGit,
    drafts,
    viewer.path,
    state.draft,
    state.baseline,
    state.savedModifiedMs,
    state.saving,
  ]);

  // Drafts live in memory only, so closing the window with edits pending
  // would lose them without this.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!drafts.hasUnsaved()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [drafts]);

  // The "Saved" flash is a confirmation, not a state; it should not linger.
  useEffect(() => {
    if (!state.justSaved) return;
    const timer = window.setTimeout(
      () => setState((current) => ({ ...current, justSaved: false })),
      2000,
    );
    return () => window.clearTimeout(timer);
  }, [state.justSaved]);

  return { ...viewer, ...state, dirty, editable, onChange, save };
}
