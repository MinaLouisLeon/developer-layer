import { useViewerMode } from "../context/ViewerModeContext";
import { VIEWER_COPY } from "../messages";

const BUTTON =
  "rounded border px-1.5 py-0.5 text-xs focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong";
const ACTIVE = "border-accent bg-accentMuted text-accentStrong";
const IDLE =
  "border-border text-textMuted hover:border-borderStrong hover:text-text";

/**
 * File / Diff, and the blame toggle.
 *
 * Takes no props: it reads `ViewerModeContext`, which is also what the history
 * list writes to when it opens a file at a commit. Blame is only offered in
 * file mode - there are no lines to attribute in a diff - and is off by
 * default, because turning it on changes the editor's shape and should not
 * surprise anyone.
 */
export function ViewerModeToggle({ blameLoading }: { blameLoading: boolean }) {
  const { mode, setMode, blame, toggleBlame } = useViewerMode();

  return (
    <span className="flex shrink-0 items-center gap-1">
      <span className="flex items-center gap-0.5" role="group" aria-label="View mode">
        <button
          type="button"
          onClick={() => setMode("file")}
          aria-pressed={mode === "file"}
          title={VIEWER_COPY.modeFileHint}
          className={`${BUTTON} ${mode === "file" ? ACTIVE : IDLE}`}
        >
          {VIEWER_COPY.modeFile}
        </button>
        <button
          type="button"
          onClick={() => setMode("diff")}
          aria-pressed={mode === "diff"}
          title={VIEWER_COPY.modeDiffHint}
          className={`${BUTTON} ${mode === "diff" ? ACTIVE : IDLE}`}
        >
          {VIEWER_COPY.modeDiff}
        </button>
      </span>
      {mode === "file" ? (
        <button
          type="button"
          onClick={toggleBlame}
          aria-pressed={blame}
          title={VIEWER_COPY.blameHint}
          className={`${BUTTON} ${blame ? ACTIVE : IDLE}`}
        >
          {blameLoading ? VIEWER_COPY.blameLoading : VIEWER_COPY.blameOn}
        </button>
      ) : null}
    </span>
  );
}
