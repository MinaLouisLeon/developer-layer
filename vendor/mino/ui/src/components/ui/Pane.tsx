import type { PaneProps } from "./types";

/**
 * The frame every pane sits in: a labelled region with a header strip and a
 * scrollable body. Keeping it here means the three panes cannot drift apart
 * visually or in the accessibility tree.
 */
export function Pane({ title, accessory, children }: PaneProps) {
  return (
    <section
      aria-label={title}
      className="flex h-full min-h-0 flex-col border border-border bg-surface"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-surfaceRaised px-3 py-1.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-textMuted">
          {title}
        </h2>
        {accessory ? (
          <div className="min-w-0 truncate text-xs text-textFaint">
            {accessory}
          </div>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}
