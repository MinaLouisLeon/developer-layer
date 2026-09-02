import type { Ref } from "react";

import type { ReviewThreadsState } from "../hooks/useReviewThreads";
import { ReviewPanel } from "./ReviewPanel";

interface ReviewForFileProps {
  review: ReviewThreadsState;
  /** The pull request being reviewed, or `null` when none is. */
  number: number | null;
  /** Scrolled into view when a gutter marker is pressed. */
  ref: Ref<HTMLDivElement>;
}

/**
 * The review panel, or nothing at all.
 *
 * A component rather than a conditional inside `ViewerPane` for one reason
 * worth stating: the viewer already carries the editor, the diff, the blame
 * gutter and four status shapes, and every feature that has reached for space
 * in it has added another branch to the same render. This one takes its
 * condition with it.
 *
 * The condition is the whole of the component: **nothing appears unless a pull
 * request is being reviewed**, which is an explicit control on a pull request
 * row and never something the app decides on somebody's behalf.
 */
export function ReviewForFile({ review, number, ref }: ReviewForFileProps) {
  if (number === null) return null;
  return (
    <div ref={ref}>
      <ReviewPanel review={review} number={number} />
    </div>
  );
}
