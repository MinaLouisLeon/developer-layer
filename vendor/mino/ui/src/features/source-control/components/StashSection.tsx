import { ChevronDown, ChevronRight } from "lucide-react";

import { relativeTime } from "@/lib/relativeTime";

import { useStash } from "../hooks/useStash";
import { STASH_COPY } from "../messages";
import { StashDropConfirm } from "./StashDropConfirm";
import { StashRow } from "./StashRow";

/**
 * The stash: what is set aside, and the control that sets more aside.
 *
 * Collapsed by default, and the list is only read once it is opened. Most
 * repositories have nothing stashed, and a call per session for an empty
 * stack is a call for nothing.
 *
 * Presentational: every decision it renders comes from `useStash`.
 */
export function StashSection({ active }: { active: boolean }) {
  const stash = useStash(active);
  const Chevron = stash.open ? ChevronDown : ChevronRight;

  return (
    <section aria-label={STASH_COPY.heading} className="border-t border-border py-1">
      <header className="flex items-center gap-2 px-2 py-1">
        <button
          type="button"
          onClick={stash.toggle}
          aria-expanded={stash.open}
          title={stash.open ? STASH_COPY.hide : STASH_COPY.show}
          className="flex items-center gap-1 rounded text-xs font-medium uppercase tracking-wide text-textMuted hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
        >
          <Chevron size={12} strokeWidth={1.5} aria-hidden="true" />
          {STASH_COPY.heading}
        </button>
        {stash.entries.length > 0 ? (
          <span className="rounded bg-surfaceHover px-1.5 text-xs text-textMuted">
            {stash.entries.length}
          </span>
        ) : null}
      </header>

      {stash.open ? (
        <>
          <form
            className="flex flex-col gap-1 px-2 pb-1"
            onSubmit={(event) => {
              event.preventDefault();
              stash.push();
            }}
          >
            <div className="flex items-center gap-1">
              <input
                value={stash.message}
                onChange={(event) => stash.setMessage(event.target.value)}
                disabled={stash.busy}
                aria-label={STASH_COPY.messageLabel}
                placeholder={STASH_COPY.messagePlaceholder}
                className="min-w-0 flex-1 rounded border border-border bg-surface px-1.5 py-1 text-xs text-text placeholder:text-textFaint focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
              />
              <button
                type="submit"
                disabled={stash.busy}
                className="shrink-0 rounded border border-borderStrong px-1.5 py-1 text-xs text-text hover:bg-surfaceHover focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong disabled:opacity-40"
              >
                {STASH_COPY.push}
              </button>
            </div>
            <label
              className="flex items-center gap-1.5 text-xs text-textFaint"
              title={STASH_COPY.includeUntrackedTitle}
            >
              <input
                type="checkbox"
                checked={stash.includeUntracked}
                onChange={stash.toggleUntracked}
                disabled={stash.busy}
              />
              {STASH_COPY.includeUntracked}
            </label>
          </form>

          {stash.error ? (
            <p className="px-2 py-1 text-xs text-danger">{stash.error}</p>
          ) : null}

          {stash.entries.length === 0 ? (
            <p className="px-2 py-1 text-xs text-textFaint">
              {stash.loading ? STASH_COPY.loading : STASH_COPY.empty}
            </p>
          ) : (
            <ul>
              {stash.entries.map((entry) => (
                // Keyed by index *and* message: an index is a position, and
                // after a drop the entry at 0 is a different entry entirely.
                <StashRow
                  key={`${entry.index}:${entry.message}`}
                  entry={entry}
                  busy={stash.busy}
                  age={relativeTime(entry.timestampMs)}
                  onApply={stash.apply}
                  onDrop={stash.askDrop}
                />
              ))}
            </ul>
          )}
        </>
      ) : null}

      <StashDropConfirm
        prompt={stash.prompt}
        onConfirm={stash.confirmDrop}
        onCancel={stash.cancelDrop}
      />
    </section>
  );
}
