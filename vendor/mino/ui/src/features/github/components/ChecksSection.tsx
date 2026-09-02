import { relativeTime } from "@/lib/relativeTime";

import { useChecks } from "../hooks/useChecks";
import { useGitHubContext } from "../context/GitHubContext";
import { CHECKS_COPY } from "../messages";
import { CheckState } from "./CheckState";
import { ExternalLink } from "./ExternalLink";
import { Section } from "./Section";

/**
 * The latest run for the current branch - #14, and the section that earns its
 * place daily.
 *
 * It answers three things in one glance: whether the branch is green, what the
 * run was for, and - when it is red - **which job broke**. That last one is
 * the difference between a notification and something worth acting on, and it
 * is why this section makes a second call for a failed run and no call at all
 * for a green one.
 *
 * Presentational: every decision it renders comes from `useChecks`.
 */
export function ChecksSection({ active }: { active: boolean }) {
  const checks = useChecks(active);
  const { branch, branchKnown } = useGitHubContext();

  return (
    <Section
      heading={CHECKS_COPY.heading}
      open={checks.open}
      toggle={checks.toggle}
      hint={checks.open ? CHECKS_COPY.hide : CHECKS_COPY.show}
      // Only while collapsed. Open, the state is spelled out in words two
      // lines below, and a second copy beside the heading would be the same
      // word announced twice to a screen reader.
      accessory={
        !checks.open && checks.run ? (
          <CheckState state={checks.run.state} />
        ) : undefined
      }
    >
      {checks.error ? (
        <p className="px-2 py-1 text-xs text-danger">{checks.error}</p>
      ) : branchKnown && branch === null ? (
        // Only once git has answered. `branch` is also null in the moment
        // before it does, and saying "there is no branch checked out" about a
        // branch that was simply not read yet is a false statement the reader
        // has no way to question.
        <p className="px-2 py-1 text-xs text-textFaint">
          {CHECKS_COPY.noBranch}
        </p>
      ) : checks.run === null ? (
        <p className="px-2 py-1 text-xs text-textFaint">
          {checks.loading ? CHECKS_COPY.loading : CHECKS_COPY.empty}
        </p>
      ) : (
        <div className="px-2 py-1 text-xs">
          <div className="flex items-start gap-2">
            <CheckState state={checks.run.state} showLabel />
            <span className="min-w-0 flex-1">
              {/* Every string below was written by somebody else - a workflow
                  author, a commit message - and is rendered as text. React
                  escapes it; nothing here sets HTML. */}
              <span className="block truncate text-text" title={checks.run.title}>
                {checks.run.title}
              </span>
              <span className="block truncate text-textFaint">
                {checks.run.workflow}
                {checks.run.startedMs === null
                  ? ""
                  : ` · ${relativeTime(checks.run.startedMs)}`}
              </span>
            </span>
            <ExternalLink url={checks.run.url} title={CHECKS_COPY.viewRun} />
          </div>

          {/* Only ever present for a failed run that has a job to name. A
              green build has none worth naming, and a run that failed at the
              workflow level has none at all - a heading with nothing under it
              is worse than no heading. */}
          {checks.run.state === "failed" &&
          (checks.jobsLoading || checks.failingJobs.length > 0) ? (
            <div className="mt-1 border-l-2 border-danger pl-2">
              <p className="text-textMuted">{CHECKS_COPY.failingJobs}</p>
              {checks.jobsLoading ? (
                <p className="text-textFaint">{CHECKS_COPY.jobsLoading}</p>
              ) : (
                <ul>
                  {checks.failingJobs.map((job) => (
                    <li key={job.name} className="truncate text-danger" title={job.name}>
                      {job.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      )}
    </Section>
  );
}
