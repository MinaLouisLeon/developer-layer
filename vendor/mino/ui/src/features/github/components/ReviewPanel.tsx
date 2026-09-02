import type { ReviewThreadsState } from "../hooks/useReviewThreads";
import { REVIEW_COPY } from "../messages";
import { ReviewThread } from "./ReviewThread";

interface ReviewPanelProps {
  review: ReviewThreadsState;
  /** The pull request being reviewed, for the heading. */
  number: number;
}

/**
 * The review threads on the open file - #17.
 *
 * Below the editor rather than beside it, because it is a conversation about
 * the file and not a second view of it, and because the editor is the thing
 * that must not get narrower.
 *
 * **Outdated threads are listed here and never drawn in the gutter.** That
 * split is the whole answer to the hard part of this feature: a comment
 * anchored to a diff position that no longer exists cannot be placed, so it is
 * shown where it can be read rather than pinned to a line it might not belong
 * to. The gutter is for the ones that can be placed; this is for all of them.
 *
 * Presentational: every decision it renders comes from `useReviewThreads`.
 */
export function ReviewPanel({ review, number }: ReviewPanelProps) {
  return (
    <section
      aria-label={REVIEW_COPY.heading}
      className="flex max-h-64 shrink-0 flex-col overflow-hidden border-t border-border"
    >
      <header className="flex shrink-0 items-center gap-2 bg-surfaceRaised px-2 py-1">
        <h3 className="text-xs font-medium uppercase tracking-wide text-textMuted">
          {REVIEW_COPY.heading}
        </h3>
        <span className="text-xs text-textFaint">
          {REVIEW_COPY.reviewing(number)}
        </span>
      </header>

      {review.error ? (
        <p className="px-2 py-1 text-xs text-danger">{review.error}</p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {review.forPath.length === 0 ? (
          <p className="px-2 py-1 text-xs text-textFaint">
            {review.loading ? REVIEW_COPY.loading : REVIEW_COPY.empty}
          </p>
        ) : (
          <ul>
            {review.forPath.map((thread) => (
              <ReviewThread
                key={thread.id}
                thread={thread}
                replying={review.replying}
                onReply={review.reply}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
