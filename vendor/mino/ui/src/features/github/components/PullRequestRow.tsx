import type { GitHubPullRequest } from "@/Types";
import { relativeTime } from "@/lib/relativeTime";

import { useGitHubContext } from "../context/GitHubContext";
import { PULL_REQUESTS_COPY, REVIEW_COPY } from "../messages";
import { CheckState } from "./CheckState";
import { ExternalLink } from "./ExternalLink";

interface PullRequestRowProps {
  pull: GitHubPullRequest;
  selected: boolean;
  onSelect: (number: number) => void;
}

/**
 * One pull request: its number, title, author, check state and branch pair.
 *
 * **The title is rendered as text.** It was written by whoever opened the pull
 * request, which on a public repository is anybody at all, and it goes into a
 * text node - React escapes it, and nothing here sets HTML. That is the UI
 * half of the promise `mino_core::github::parse` makes on the other side.
 *
 * The row itself selects, and the external link is a separate control. Making
 * the whole row a link would mean every attempt to read a description sent the
 * reader out to a browser.
 *
 * A `div` rather than an `li`, because the section pairs it with the
 * description that opens underneath and the pair is the list item.
 */
export function PullRequestRow({
  pull,
  selected,
  onSelect,
}: PullRequestRowProps) {
  // #17. Reviewing is a state of the window rather than of this row, because
  // the threads are drawn in the editor - which knows nothing about a list in
  // the sidebar.
  const { reviewing, review } = useGitHubContext();
  const isReviewing = reviewing === pull.number;

  return (
    <div className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-surfaceHover">
      <button
        type="button"
        onClick={() => onSelect(pull.number)}
        aria-expanded={selected}
        className="flex min-w-0 flex-1 items-center gap-2 text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
      >
        <CheckState state={pull.checks} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-text" title={pull.title}>
            <span className="text-textFaint">#{pull.number}</span> {pull.title}
          </span>
          <span className="block truncate text-textFaint">
            {pull.isDraft ? `${PULL_REQUESTS_COPY.draft} · ` : ""}
            {PULL_REQUESTS_COPY.by(pull.author)} ·{" "}
            {PULL_REQUESTS_COPY.into(pull.baseRef)}
            {pull.updatedMs === null ? "" : ` · ${relativeTime(pull.updatedMs)}`}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => review(isReviewing ? null : pull.number)}
        aria-pressed={isReviewing}
        title={isReviewing ? REVIEW_COPY.stop : REVIEW_COPY.start}
        className={`shrink-0 rounded border px-1.5 py-0.5 text-xs focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong ${
          isReviewing
            ? "border-accent bg-accentMuted text-accentStrong"
            : "border-border text-textMuted hover:border-borderStrong hover:text-text"
        }`}
      >
        {REVIEW_COPY.heading}
      </button>
      <ExternalLink url={pull.url} title={PULL_REQUESTS_COPY.open} />
    </div>
  );
}
