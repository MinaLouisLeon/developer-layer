import { basename } from "@/lib/path";

import { BRANCH_COPY } from "../messages";
import type { CheckoutPrompt } from "../types";

interface CheckoutConfirmProps {
  prompt: CheckoutPrompt | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The warning in front of a checkout that would strand an unsaved edit.
 *
 * Deliberately *not* shaped like `DiscardConfirm`, because it is not the same
 * kind of question. Discard asks about destroying work and its confirm button
 * is styled as the dangerous thing it is. This asks about a working tree
 * changing underneath edits that are kept either way - so it names the files,
 * says plainly that nothing is thrown away, and offers going back to save as
 * the focused default.
 *
 * The default is "stay and save" for the same reason discard's is "keep my
 * changes": Enter should do the reversible thing.
 */
export function CheckoutConfirm({
  prompt,
  onConfirm,
  onCancel,
}: CheckoutConfirmProps) {
  if (!prompt) return null;
  const many = prompt.unsaved.length > 1;
  const first = prompt.unsaved[0] ?? "";
  const name = basename(first);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={BRANCH_COPY.strandTitle}
      className="fixed inset-0 z-30 flex items-center justify-center bg-surfaceSunken/80 p-4"
    >
      <div className="flex w-full max-w-md flex-col gap-3 rounded border border-warning bg-surfaceRaised p-4">
        <h2 className="text-sm font-medium text-text">
          {BRANCH_COPY.strandTitle}
        </h2>
        <p className="text-sm text-textMuted">
          {many
            ? BRANCH_COPY.strandMany(prompt.unsaved.length, prompt.name)
            : BRANCH_COPY.strandOne(name, prompt.name)}
        </p>
        {/* Named, not counted. A warning that says "you have unsaved changes"
            without saying which files is a warning nobody can act on. */}
        {many ? (
          <ul className="max-h-32 overflow-y-auto text-xs text-textFaint">
            {prompt.unsaved.map((path) => (
              <li key={path} className="truncate" title={path}>
                {path}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="rounded border border-borderStrong px-2 py-1 text-xs text-text hover:bg-surfaceHover focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
          >
            {BRANCH_COPY.strandCancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded border border-warning px-2 py-1 text-xs text-warning hover:bg-warningMuted focus:outline-none focus-visible:ring-1 focus-visible:ring-warning"
          >
            {BRANCH_COPY.strandConfirm(prompt.name)}
          </button>
        </div>
      </div>
    </div>
  );
}
