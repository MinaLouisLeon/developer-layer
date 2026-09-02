import { REMOTE_COPY } from "../messages";
import type { PushPrompt } from "../types";

interface PushConfirmProps {
  prompt: PushPrompt | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The confirmation in front of a push, and in front of a force push.
 *
 * One component for both, because they are one prompt with one path to the
 * transport - which is what makes it impossible to reach a force push by
 * answering the ordinary confirmation. What differs is everything the reader
 * sees: the title, the sentence, the button, and the border.
 *
 * The force wording is the part to be careful with. It does not say "this
 * cannot be undone" - it says what will be gone and whose it might be,
 * because "are you sure?" is a question people answer yes to without reading.
 * It also says what git will still refuse, since `--force-with-lease` is a
 * real protection and a reader who knows about it can act more confidently.
 */
export function PushConfirm({ prompt, onConfirm, onCancel }: PushConfirmProps) {
  if (!prompt) return null;
  const { remote, branch, force } = prompt;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={force ? REMOTE_COPY.forceTitle : REMOTE_COPY.pushTitle}
      className="fixed inset-0 z-30 flex items-center justify-center bg-surfaceSunken/80 p-4"
    >
      <div
        className={`flex w-full max-w-sm flex-col gap-3 rounded border bg-surfaceRaised p-4 ${
          force ? "border-danger" : "border-borderStrong"
        }`}
      >
        <h2 className="text-sm font-medium text-text">
          {force ? REMOTE_COPY.forceTitle : REMOTE_COPY.pushTitle}
        </h2>
        <p className="text-sm text-textMuted">
          {force
            ? REMOTE_COPY.forceBody(remote, branch)
            : REMOTE_COPY.pushBody(remote, branch)}
        </p>
        {force ? (
          <p className="text-xs text-textFaint">{REMOTE_COPY.forceSafety}</p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          {/* Cancelling is the focused default, as it is for every other
              confirmation in this panel. */}
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="rounded border border-borderStrong px-2 py-1 text-xs text-text hover:bg-surfaceHover focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
          >
            {REMOTE_COPY.pushCancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={
              force
                ? "rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-dangerMuted focus:outline-none focus-visible:ring-1 focus-visible:ring-danger"
                : "rounded border border-accent px-2 py-1 text-xs text-accentStrong hover:bg-accentMuted focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
            }
          >
            {force ? REMOTE_COPY.forceConfirm : REMOTE_COPY.pushConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
