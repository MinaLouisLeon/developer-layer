import { useCallback, useState } from "react";

import type { GitHubQuery } from "@/Types";
import { GITHUB_LIST_LIMIT } from "@/Types";

import { useGitHubContext } from "../context/GitHubContext";
import type { IssuesState } from "../types";
import { useGitHubQuery } from "./useGitHubQuery";

/**
 * Open issues.
 *
 * **Collapsed by default**, and the list is only read once it is opened -
 * the same bargain the stash section makes. An issue list is background
 * reading rather than something you check before a commit, and a call per
 * session for a list nobody looked at is a call spent from the reader's rate
 * limit for nothing.
 */
export function useIssues(active: boolean): IssuesState {
  const { nonce } = useGitHubContext();
  const [open, setOpen] = useState(false);

  const request: GitHubQuery | null =
    active && open
      ? { kind: "issues", detail: { state: "open", limit: GITHUB_LIST_LIMIT } }
      : null;
  const list = useGitHubQuery(request, "issues", nonce);

  return {
    open,
    toggle: useCallback(() => setOpen((current) => !current), []),
    issues: list.data ?? [],
    loading: list.loading,
    error: list.error,
  };
}
