import { SOURCE_CONTROL_COPY } from "../messages";
import type { DiscardPrompt } from "../types";

interface DiscardConfirmProps {
  prompt: DiscardPrompt | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The confirmation for the one action in this app that can lose work outright.
 *
 * Three things about it are deliberate, and all three are the discard rule
 * written down in `docs/mino-workbench/git-module.md`:
 *
 * - it **names** what will be lost - the file, or the count - rather than
 *   saying "are you sure?";
 * - the confirm button says what it will do (`Discard main.rs`), not "OK", so
 *   a reader who skipped the sentence still sees the consequence;
 * - the cancel is the primary-styled, auto-focused button. Keeping your work
 *   is the safe default, and Enter should do the safe thing.
 */
export function DiscardConfirm({
  prompt,
  onConfirm,
  onCancel,
}: DiscardConfirmProps) {
  if (!prompt) return null;
  const many = prompt.paths.length > 1;
  const count = prompt.paths.length;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={SOURCE_CONTROL_COPY.discardTitle}
      className="absolute inset-0 z-10 flex items-center justify-center bg-surfaceSunken/80 p-4"
    >
      <div className="flex w-full max-w-sm flex-col gap-3 rounded border border-danger bg-surfaceRaised p-4">
        <h2 className="text-sm font-medium text-text">
          {SOURCE_CONTROL_COPY.discardTitle}
        </h2>
        <p className="text-sm text-textMuted">
          {many
            ? SOURCE_CONTROL_COPY.discardMany(count)
            : SOURCE_CONTROL_COPY.discardOne(prompt.label)}
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="rounded border border-borderStrong px-2 py-1 text-xs text-text hover:bg-surfaceHover focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
          >
            {SOURCE_CONTROL_COPY.discardCancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-dangerMuted focus:outline-none focus-visible:ring-1 focus-visible:ring-danger"
          >
            {many
              ? SOURCE_CONTROL_COPY.discardConfirmMany(count)
              : SOURCE_CONTROL_COPY.discardConfirmOne(prompt.label)}
          </button>
        </div>
      </div>
    </div>
  );
}
