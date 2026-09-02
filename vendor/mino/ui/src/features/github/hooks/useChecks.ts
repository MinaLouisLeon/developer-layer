import { useCallback, useState } from "react";

import type { GitHubQuery } from "@/Types";

import { useGitHubContext } from "../context/GitHubContext";
import type { ChecksState } from "../types";
import { useGitHubQuery } from "./useGitHubQuery";

/**
 * The latest run for the current branch, and - when it failed - which job
 * broke.
 *
 * **Open by default**, and it is the only section that is. This is the one
 * that earns its place daily: the first thing worth knowing when you look at
 * a branch is whether it is green, and a section you have to open to find that
 * out is a section you will forget to open.
 *
 * Two calls rather than one, and only sometimes. `gh run list` reports a run's
 * conclusion and never its jobs, so a single call can say "the pipeline
 * failed" and nothing more. The second call is made **only for a run that
 * failed** - a green build has no job worth naming, and asking anyway would
 * double the cost of the common case to answer a question nobody asked.
 */
export function useChecks(active: boolean): ChecksState {
  const { branch, branchKnown, nonce } = useGitHubContext();
  const [open, setOpen] = useState(true);

  // One run: `gh run list` answers newest first, so the latest is the only one
  // this section shows and the only one worth paying for.
  //
  // `branchKnown` guards the read as well as the sentence below it: asking for
  // runs on a branch that has not been read yet would be asking about the
  // wrong branch, and the answer would look like an answer.
  const request: GitHubQuery | null =
    active && open && branchKnown && branch !== null
      ? { kind: "runs", detail: { branch, limit: 1 } }
      : null;
  const runs = useGitHubQuery(request, "runs", nonce);
  const run = runs.data?.[0] ?? null;

  const jobsRequest: GitHubQuery | null =
    run !== null && run.state === "failed"
      ? { kind: "runJobs", detail: { runId: run.id } }
      : null;
  const jobs = useGitHubQuery(jobsRequest, "jobs", nonce);

  return {
    open,
    toggle: useCallback(() => setOpen((current) => !current), []),
    run,
    // Reading the branch is part of loading this section: until git has
    // answered there is nothing to ask about, and saying so is truer than
    // showing an empty state.
    loading: runs.loading || !branchKnown,
    // The run's failure first: a jobs call that failed is a detail about a
    // run the reader can already see.
    error: runs.error ?? jobs.error,
    failingJobs: (jobs.data ?? []).filter((job) => job.state === "failed"),
    jobsLoading: jobs.loading,
  };
}
