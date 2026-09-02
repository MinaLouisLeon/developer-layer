/**
 * Copy for review threads - #17.
 *
 * The wording that matters is `outdated`. A thread whose diff is no longer
 * current is not broken and is not resolved; it is a comment about code that
 * has since changed, and it is still worth reading. Saying that plainly is the
 * difference between a reader dismissing it and a reader going to look.
 */
export const REVIEW_COPY = {
  heading: "Review",
  /** The chip in the viewer header, naming what is being reviewed. */
  reviewing: (number: number) => `Reviewing #${number}`,
  stop: "Stop reviewing this pull request",
  start: "Review this pull request in the editor",

  loading: "Reading review comments…",
  empty: "No review comments on this file.",
  emptyPullRequest: "No review comments on this pull request yet.",

  /** The gutter marker, which has room for a number and nothing else. */
  marker: (count: number) => (count > 9 ? "9+" : String(count)),
  markerHint: (count: number) =>
    count === 1
      ? "1 review comment on this line"
      : `${count} review comments on this line`,

  /**
   * Said about a thread GitHub can no longer place. Not "resolved" and not
   * "old" - the comment stands, and only its position is gone.
   */
  outdated: "Outdated",
  outdatedHint:
    "This was written against an earlier version of the diff, so GitHub no longer has a line for it. It is shown here rather than pinned to a line it might not belong to.",

  /** Every thread names its own file, because the gutter match is a suffix. */
  onPath: (path: string) => `on ${path}`,

  replyPlaceholder: "Reply…",
  replyLabel: "Reply to this thread",
  reply: "Reply",
  replying: "Sending…",

  open: "Open this thread on github.com",
} as const;
