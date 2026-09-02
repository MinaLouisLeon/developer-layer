import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleSlash,
  LoaderCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { GitHubCheckState } from "@/Types";

import { CHECK_STATE_LABELS } from "../messages";

/**
 * How a check state looks, in one place.
 *
 * **A shape as well as a colour, always.** Green and red are the fastest way
 * to read this and the one that fails a reader who cannot tell them apart, so
 * every state has its own icon and its own word - the word carried by
 * `aria-label` and by the tooltip, not left to the colour to imply.
 *
 * The tones are `theme/tokens.ts` names. Passed is `accent` rather than a
 * green of its own, and failed is `danger`, because those are what the rest of
 * the app already means by "fine" and "look at this".
 */
const PRESENTATION: Record<
  GitHubCheckState,
  { icon: LucideIcon; className: string }
> = {
  pending: { icon: CircleDashed, className: "text-textFaint" },
  running: { icon: LoaderCircle, className: "text-info" },
  passed: { icon: CircleCheck, className: "text-accent" },
  failed: { icon: CircleAlert, className: "text-danger" },
  cancelled: { icon: CircleSlash, className: "text-textMuted" },
  skipped: { icon: CircleMinus, className: "text-textFaint" },
  unknown: { icon: CircleDashed, className: "text-textFaint" },
};

export function CheckState({
  state,
  showLabel = false,
}: {
  state: GitHubCheckState;
  /** True in the checks section, where there is room to say it in words. */
  showLabel?: boolean;
}) {
  const { icon: Icon, className } = PRESENTATION[state];
  const label = CHECK_STATE_LABELS[state];

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 text-xs ${className}`}
      title={label}
    >
      <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
      {showLabel ? (
        <span>{label}</span>
      ) : (
        // The word is still there for a screen reader, which cannot be
        // expected to make anything of an icon.
        <span className="sr-only">{label}</span>
      )}
    </span>
  );
}
