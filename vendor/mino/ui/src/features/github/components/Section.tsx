import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

interface SectionProps {
  heading: string;
  open: boolean;
  toggle: () => void;
  /** The disclosure button's tooltip, which says what pressing it does. */
  hint: string;
  /** A count, a state badge - whatever belongs beside the heading. */
  accessory?: ReactNode;
  children: ReactNode;
}

/**
 * The collapsible section every part of the GitHub view is built from.
 *
 * One component rather than four, because the disclosure is not decoration
 * here: **a closed section makes no network call.** Its `open` flag is what
 * every hook reads to decide whether to ask GitHub anything at all, so having
 * four of these would be four places for that rule to be got subtly wrong.
 *
 * Shaped like the source control panel's stash and history sections, so a
 * reader who has used one already knows this one.
 *
 * Presentational: it owns nothing, and `open`/`toggle` come from the hook
 * that also owns the request.
 */
export function Section({
  heading,
  open,
  toggle,
  hint,
  accessory,
  children,
}: SectionProps) {
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <section aria-label={heading} className="border-t border-border py-1">
      <header className="flex items-center gap-2 px-2 py-1">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          title={hint}
          className="flex items-center gap-1 rounded text-xs font-medium uppercase tracking-wide text-textMuted hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
        >
          <Chevron size={12} strokeWidth={1.5} aria-hidden="true" />
          {heading}
        </button>
        {accessory}
      </header>
      {open ? children : null}
    </section>
  );
}

/** The count badge the lists put beside their heading. */
export function SectionCount({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="rounded bg-surfaceHover px-1.5 text-xs text-textMuted">
      {count}
    </span>
  );
}
