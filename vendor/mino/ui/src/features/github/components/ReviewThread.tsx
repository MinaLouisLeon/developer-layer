import { useState } from "react";

import type { GitHubReviewThread } from "@/Types";
import { relativeTime } from "@/lib/relativeTime";

import { REVIEW_COPY } from "../messages";
import { ExternalLink } from "./ExternalLink";

interface ReviewThreadProps {
  thread: GitHubReviewThread;
  replying: boolean;
  onReply: (commentId: number, body: string) => void;
}

/**
 * One review thread and its replies.
 *
 * **Every comment body is rendered as text**, in a `whitespace-pre-wrap`
 * block, exactly as a pull request description is. It is Markdown written by
 * whoever left the review, and a renderer here would be a renderer pointed at
 * untrusted input for text that is one click from being read on github.com
 * properly.
 *
 * An **outdated** thread says so, above its first comment, and says what
 * outdated means. It is not resolved and it is not stale: the comment stands,
 * and only its position is gone. A reader who is told "outdated" without that
 * sentence will assume it can be ignored.
 */
export function ReviewThread({
  thread,
  replying,
  onReply,
}: ReviewThreadProps) {
  const [draft, setDraft] = useState("");
  const [first] = thread.comments;

  return (
    <li className="border-b border-border px-2 py-1.5 last:border-b-0">
      <div className="flex items-center gap-1 text-xs text-textFaint">
        {thread.line === null ? null : <span>L{thread.line}</span>}
        <span className="truncate" title={thread.path}>
          {REVIEW_COPY.onPath(thread.path)}
        </span>
        {first ? (
          <ExternalLink url={first.url} title={REVIEW_COPY.open} />
        ) : null}
      </div>

      {thread.outdated ? (
        <p
          className="mt-0.5 text-xs text-warning"
          title={REVIEW_COPY.outdatedHint}
        >
          {REVIEW_COPY.outdated} · {REVIEW_COPY.outdatedHint}
        </p>
      ) : null}

      <ul className="mt-1 flex flex-col gap-1">
        {thread.comments.map((comment) => (
          <li key={comment.id}>
            <p className="text-xs text-textMuted">
              {comment.author}
              {comment.createdMs === null
                ? ""
                : ` · ${relativeTime(comment.createdMs)}`}
            </p>
            {/* Text, never markup. See the component doc. */}
            <p className="whitespace-pre-wrap break-words text-xs text-text">
              {comment.body}
            </p>
          </li>
        ))}
      </ul>

      <form
        className="mt-1 flex items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          onReply(thread.id, draft);
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={replying}
          aria-label={REVIEW_COPY.replyLabel}
          placeholder={REVIEW_COPY.replyPlaceholder}
          className="min-w-0 flex-1 rounded border border-border bg-surface px-1.5 py-1 text-xs text-text placeholder:text-textFaint focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
        />
        <button
          type="submit"
          disabled={replying || draft.trim() === ""}
          className="shrink-0 rounded border border-borderStrong px-1.5 py-1 text-xs text-text hover:bg-surfaceHover focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong disabled:opacity-40"
        >
          {replying ? REVIEW_COPY.replying : REVIEW_COPY.reply}
        </button>
      </form>
    </li>
  );
}
