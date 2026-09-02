import { useRef } from "react";

import { Notice, Pane, StatusMessage } from "@/components/ui";
import { OpenOnGitHub } from "@/features/github/components/OpenOnGitHub";
import { ReviewForFile } from "@/features/github/components/ReviewForFile";
import { useGitHubContext } from "@/features/github/context/GitHubContext";
import { useReviewThreads } from "@/features/github/hooks/useReviewThreads";
import { basename } from "@/lib/path";

import { useViewerMode } from "../context/ViewerModeContext";
import { useBlame } from "../hooks/useBlame";
import { useCodeMirror } from "../hooks/useCodeMirror";
import { useFileDiff } from "../hooks/useFileDiff";
import { useFileEditor } from "../hooks/useFileEditor";
import { VIEWER_COPY } from "../messages";
import { DiffView } from "./DiffView";
import { EditorStatus } from "./EditorStatus";
import { ViewerModeToggle } from "./ViewerModeToggle";

/** Presentational: state, guards and the editor instance all come from hooks. */
export function ViewerPane() {
  const panel = useRef<HTMLDivElement | null>(null);
  const {
    status,
    payload,
    error,
    guarded,
    path,
    revision,
    draft,
    dirty,
    editable,
    saving,
    saveError,
    justSaved,
    onChange,
    save,
  } = useFileEditor();

  const { mode, blame } = useViewerMode();
  // #17. `reviewing` is null unless the reader picked a pull request, so this
  // costs no call and draws nothing by default.
  const { reviewing } = useGitHubContext();
  const review = useReviewThreads(reviewing, path);
  const showingDiff = mode === "diff";
  const showEditor = !showingDiff && status === "ready";

  // Not gated on the file being readable. A commit's diff is worth showing for
  // a file that was deleted afterwards, or one too large for the editor: in
  // both cases there is no content to read and a real change to look at.
  const diff = useFileDiff(showingDiff);
  const blameState = useBlame(blame && showEditor);

  const editor = useCodeMirror({
    content: draft,
    extension: payload?.extension ?? null,
    editable,
    revision,
    onChange,
    onSave: () => void save(),
    visible: showEditor,
    blame: blame ? blameState.byLine : null,
    review: review.forPath,
    // Pressing a gutter marker scrolls the panel into view rather than
    // opening anything: the threads are already listed below, and a marker
    // that opened a second surface would be a second place to read them.
    onOpenReview: () => panel.current?.scrollIntoView({ block: "nearest" }),
  });

  return (
    <Pane
      title="Viewer"
      accessory={
        path ? (
          <span className="flex items-center gap-2">
            {/* #19. Renders nothing at all where there is no GitHub
                repository, no gh, or no file - a control that is present but
                dead is one the reader keeps trying. */}
            <OpenOnGitHub path={path} currentLine={editor.currentLine} />
            <ViewerModeToggle blameLoading={blameState.loading} />
            <EditorStatus
              name={basename(path)}
              dirty={dirty}
              saving={saving}
              justSaved={justSaved}
              onSave={() => void save()}
            />
          </span>
        ) : undefined
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        {showEditor && saveError ? (
          <div className="shrink-0 p-2">
            <Notice variant="danger" title={VIEWER_COPY.saveErrorTitle}>
              {saveError}
            </Notice>
          </div>
        ) : null}
        {showEditor && blameState.error ? (
          <div className="shrink-0 p-2">
            <Notice variant="warning">{blameState.error}</Notice>
          </div>
        ) : null}

        {/* Always rendered, and always in this position. The editor is
            **hidden, not unmounted**, whenever anything else is showing:
            rebuilding it would restore the document from `draft` - correct,
            but it loses the cursor - and the point of a mode toggle is that it
            costs nothing to look at the diff. Moving this element between
            branches would remount it and break exactly that, which is why the
            conditionals below sit beside it rather than around it.
            `useCodeMirror` is told when it comes back, because a CodeMirror
            laid out at zero height measures itself wrong. */}
        <div
          ref={editor.container}
          hidden={!showEditor}
          aria-label={path ? `Contents of ${basename(path)}` : "File contents"}
          className="min-h-0 flex-1"
        />

        {showEditor ? null : showingDiff && path ? (
          <div className="min-h-0 flex-1">
            <DiffView diff={diff} />
          </div>
        ) : status === "empty" ? (
          <StatusMessage
            title={VIEWER_COPY.emptyTitle}
            description={VIEWER_COPY.emptyBody}
          />
        ) : status === "loading" ? (
          <StatusMessage
            title={VIEWER_COPY.loadingTitle}
            description={VIEWER_COPY.loadingBody}
          />
        ) : (
          <StatusMessage
            title={guarded ? VIEWER_COPY.guardedTitle : VIEWER_COPY.errorTitle}
            description={error ?? undefined}
            tone={guarded ? "warning" : "danger"}
          />
        )}

        {/* Renders nothing unless a review is running. Outdated threads are
            listed there and never drawn in the gutter - see `ReviewPanel`. */}
        <ReviewForFile review={review} number={reviewing} ref={panel} />
      </div>
    </Pane>
  );
}
