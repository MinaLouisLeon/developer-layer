import { useCallback, useState } from "react";

import type { GitHubQuery, GitHubReviewThread } from "@/Types";
import { useTransport } from "@/context/TransportContext";
import { describeFailure } from "@/lib/transportError";

import { useGitHubContext } from "../context/GitHubContext";
import { ask } from "../query";
import { useGitHubQuery } from "./useGitHubQuery";

export interface ReviewThreadsState {
  /** Every thread on the pull request, placeable or not. */
  threads: GitHubReviewThread[];
  /** Only the ones on the file the viewer is showing. */
  forPath: GitHubReviewThread[];
  loading: boolean;
  error: string | null;
  /** True while a reply is in flight. */
  replying: boolean;
  reply: (commentId: number, body: string) => void;
}

/**
 * The review threads on one pull request - #17.
 *
 * **Read-only plus replies**, which is the plan's own limit and a deliberate
 * one. A new top-level review comment has to name a commit and a diff
 * position, and getting either wrong puts an objection against the wrong line
 * for everybody who reads it afterwards. A reply needs only the thread the
 * reader is already looking at.
 *
 * `forPath` is filtered on the thread's own `path` rather than on the file
 * being open. That is the honest match available: GitHub reports a
 * repository-relative path, and the viewer holds an absolute one, so the
 * comparison is a suffix - which can in principle match two files of the same
 * name in different folders. It is a *pointer* to a conversation rather than a
 * claim about a line, and the panel shows the thread's path so a reader can
 * tell.
 */
export function useReviewThreads(
  number: number | null,
  path: string | null,
): ReviewThreadsState {
  const transport = useTransport();
  const { nonce } = useGitHubContext();
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  // Bumped by a reply, so the list re-reads without disturbing the rest of the
  // view's refresh policy.
  const [replies, setReplies] = useState(0);

  const request: GitHubQuery | null =
    number === null ? null : { kind: "reviewComments", detail: { number } };
  const list = useGitHubQuery(request, "reviewThreads", nonce + replies);

  const threads = list.data ?? [];
  const forPath =
    path === null
      ? []
      : threads.filter((thread) => matches(path, thread.path));

  const reply = useCallback(
    (commentId: number, body: string) => {
      if (number === null || body.trim() === "") return;
      setReplying(true);
      setReplyError(null);
      void (async () => {
        try {
          await ask(
            transport.github,
            {
              kind: "replyToReviewComment",
              detail: { number, commentId, body },
            },
            "reviewThread",
          );
          // Re-read rather than appending the answer: the thread as GitHub
          // now has it is the thing worth showing, and a locally-assembled
          // one would be this app inventing a conversation.
          setReplies((current) => current + 1);
        } catch (failure) {
          setReplyError(describeFailure(failure));
        } finally {
          setReplying(false);
        }
      })();
    },
    [transport, number],
  );

  return {
    threads,
    forPath,
    loading: list.loading,
    error: replyError ?? list.error,
    replying,
    reply,
  };
}

/**
 * Whether a repository-relative path names the open file.
 *
 * A suffix match on a separator boundary, which is the strongest comparison
 * available: GitHub does not know where the checkout lives, and this app does
 * not know where the repository root sits relative to the session root. The
 * boundary check is what stops `main.rs` matching `domain.rs`.
 */
export function matches(absolute: string, relative: string): boolean {
  const normalised = absolute.replace(/\\/g, "/");
  return (
    normalised === relative ||
    normalised.endsWith(`/${relative}`)
  );
}
