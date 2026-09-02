import type { GitStash } from "@/Types";

import { STASH_COPY } from "../messages";

interface StashDropConfirmProps {
  prompt: GitStash | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The confirmation in front of dropping a stash.
 *
 * Shaped like `DiscardConfirm` on purpose, because it is the same kind of
 * question: what it removes is not committed anywhere and is reachable only
 * through the reflog afterwards, which this app does not offer. So it names
 * the entry, its confirm button says what will happen, and keeping it is the
 * focused default.
 */
export function StashDropConfirm({
  prompt,
  onConfirm,
  onCancel,
}: StashDropConfirmProps) {
  if (!prompt) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={STASH_COPY.dropTitle}
      className="fixed inset-0 z-30 flex items-center justify-center bg-surfaceSunken/80 p-4"
    >
      <div className="flex w-full max-w-sm flex-col gap-3 rounded border border-danger bg-surfaceRaised p-4">
        <h2 className="text-sm font-medium text-text">
          {STASH_COPY.dropTitle}
        </h2>
        <p className="text-sm text-textMuted">
          {STASH_COPY.dropBody(prompt.message)}
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="rounded border border-borderStrong px-2 py-1 text-xs text-text hover:bg-surfaceHover focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
          >
            {STASH_COPY.dropCancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-dangerMuted focus:outline-none focus-visible:ring-1 focus-visible:ring-danger"
          >
            {STASH_COPY.dropConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
