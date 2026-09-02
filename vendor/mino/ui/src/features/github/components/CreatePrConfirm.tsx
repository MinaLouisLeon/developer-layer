import { NEW_PR_COPY } from "../messages";
import type { NewPullRequestState } from "../types";

interface CreatePrConfirmProps {
  form: NewPullRequestState;
  /** The branch that is checked out, which is the one `gh` will push from. */
  head: string | null;
}

/**
 * The confirmation in front of creating a pull request.
 *
 * Shaped like `DiscardConfirm` and `StashDropConfirm`, though what it guards
 * is different in kind. Those two ask before work is lost; this asks before
 * something is **made public** - visible to everybody watching the repository
 * the moment it lands, and not something the app can take back.
 *
 * So it shows what will be created rather than that something will: the title
 * as typed, the branch pair, and whether it is a draft. Cancelling is the
 * focused default, for the same reason it is in the other two.
 *
 * The title is rendered as text. It is the author's own, but it is the same
 * rule as everywhere else on this surface and there is no reason for an
 * exception.
 */
export function CreatePrConfirm({ form, head }: CreatePrConfirmProps) {
  if (!form.confirming) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={NEW_PR_COPY.confirmTitle}
      className="fixed inset-0 z-30 flex items-center justify-center bg-surfaceSunken/80 p-4"
    >
      <div className="flex w-full max-w-sm flex-col gap-3 rounded border border-borderStrong bg-surfaceRaised p-4">
        <h2 className="text-sm font-medium text-text">
          {NEW_PR_COPY.confirmTitle}
        </h2>
        <p className="break-words text-sm text-text">{form.title.trim()}</p>
        <p className="text-xs text-textMuted">
          {NEW_PR_COPY.confirmFrom(head ?? "this branch", form.base)}
          {" · "}
          {form.draft ? NEW_PR_COPY.confirmDraft : NEW_PR_COPY.confirmReady}
        </p>
        <p className="text-xs text-textFaint">{NEW_PR_COPY.confirmBody}</p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={form.cancel}
            className="rounded border border-borderStrong px-2 py-1 text-xs text-text hover:bg-surfaceHover focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
          >
            {NEW_PR_COPY.confirmNo}
          </button>
          <button
            type="button"
            onClick={form.confirm}
            className="rounded border border-accent px-2 py-1 text-xs text-accentStrong hover:bg-accentMuted focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
          >
            {NEW_PR_COPY.confirmYes}
          </button>
        </div>
      </div>
    </div>
  );
}
