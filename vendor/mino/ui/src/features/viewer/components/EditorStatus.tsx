import { VIEWER_COPY } from "../messages";
import type { EditorStatusProps } from "../types";

/**
 * The save control and what it has to say.
 *
 * Sits in the pane header, so the answer to "is my work on disk?" is visible
 * without opening anything.
 */
export function EditorStatus({ name, dirty, saving, justSaved, onSave }: EditorStatusProps) {
  return (
    <span className="flex items-center gap-2">
      <span className="min-w-0 truncate">{name}</span>
      {dirty ? (
        <span className="shrink-0 text-warning" title={VIEWER_COPY.unsaved}>
          ●
        </span>
      ) : null}
      {justSaved ? (
        <span className="shrink-0 text-accent" role="status">
          {VIEWER_COPY.saved}
        </span>
      ) : null}
      <button
        type="button"
        onClick={onSave}
        disabled={!dirty || saving}
        title={VIEWER_COPY.saveHint}
        className="shrink-0 rounded border border-border px-1.5 py-0.5 text-xs text-textMuted hover:border-borderStrong hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? VIEWER_COPY.saving : VIEWER_COPY.save}
      </button>
    </span>
  );
}
