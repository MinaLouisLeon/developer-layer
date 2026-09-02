import { useCallback, useState } from "react";

import type { GitHubQuery } from "@/Types";
import { GITHUB_LIST_LIMIT } from "@/Types";

import { useGitHubContext } from "../context/GitHubContext";
import type { PullRequestsState } from "../types";
import { useGitHubQuery } from "./useGitHubQuery";

/**
 * Open pull requests, and the description of the one being looked at.
 *
 * Two calls, and the second only when somebody selects a row. A body is the
 * largest field on a pull request and is read one at a time, so a list of
 * twenty carries no bodies at all - paying for nineteen nobody opened is the
 * kind of cost that is invisible until it is a rate limit.
 *
 * Selecting is a *number*, not a row. After a refresh the list is a new list,
 * and a stored row would be a row that may no longer exist; a number is
 * re-looked-up, and a pull request that has been merged since simply stops
 * being in the list.
 */
export function usePullRequests(active: boolean): PullRequestsState {
  const { nonce } = useGitHubContext();
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);

  const request: GitHubQuery | null =
    active && open
      ? {
          kind: "pullRequests",
          detail: { state: "open", limit: GITHUB_LIST_LIMIT },
        }
      : null;
  const list = useGitHubQuery(request, "pullRequests", nonce);

  const detailRequest: GitHubQuery | null =
    active && open && selected !== null
      ? { kind: "pullRequest", detail: { number: selected } }
      : null;
  const detail = useGitHubQuery(detailRequest, "pullRequest", nonce);

  return {
    open,
    toggle: useCallback(() => setOpen((current) => !current), []),
    pulls: list.data ?? [],
    loading: list.loading,
    // The detail's failure first: it is the one the reader just caused.
    error: detail.error ?? list.error,
    selected,
    select: useCallback(
      (number: number | null) =>
        // Clicking the open row closes it, which is the behaviour a
        // disclosure anywhere else in this app already has.
        setSelected((current) => (current === number ? null : number)),
      [],
    ),
    detail: detail.data,
    detailLoading: detail.loading,
  };
}
