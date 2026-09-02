import type { KeyboardEvent } from "react";

import { Notice } from "@/components/ui";

import { SOURCE_CONTROL_COPY } from "../messages";
import type { CommitState } from "../types";

/**
 * The message input and the commit button. Presentational: every decision
 * comes from `useCommitBox`.
 *
 * The button is disabled when the commit cannot happen, *and* the reason is
 * rendered beside it. "Nothing happens when I click commit" is a bad way to
 * learn that nothing is staged.
 */
export function CommitBox({ state }: { state: CommitState }) {
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter, the shortcut every git client shares.
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      state.commit();
    }
  };

  return (
    <div className="flex flex-col gap-2 border-b border-border px-2 py-2">
      <label className="sr-only" htmlFor="commit-message">
        {SOURCE_CONTROL_COPY.messageLabel}
      </label>
      <textarea
        id="commit-message"
        rows={2}
        value={state.message}
        onChange={(event) => state.setMessage(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={SOURCE_CONTROL_COPY.messagePlaceholder}
        className="w-full resize-y rounded border border-border bg-surfaceSunken px-2 py-1 font-mono text-sm text-text placeholder:text-textFaint focus:border-borderStrong focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={state.commit}
          disabled={state.blocked !== null || state.committing}
          className="rounded border border-accent bg-accentMuted px-2 py-1 text-xs text-accentStrong hover:border-accentStrong focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong disabled:border-border disabled:bg-transparent disabled:text-textFaint"
        >
          {state.committing
            ? SOURCE_CONTROL_COPY.committing
            : SOURCE_CONTROL_COPY.commit}
        </button>
        {state.blocked ? (
          <span className="min-w-0 truncate text-xs text-textFaint">
            {state.blocked}
          </span>
        ) : null}
      </div>

      {state.landed ? (
        <p className="truncate text-xs text-accent">{state.landed}</p>
      ) : null}
      {state.error ? (
        <Notice variant="danger">{state.error}</Notice>
      ) : null}
    </div>
  );
}
