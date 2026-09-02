import { relativeTime } from "@/lib/relativeTime";

import { useIssues } from "../hooks/useIssues";
import { ISSUES_COPY } from "../messages";
import { ExternalLink } from "./ExternalLink";
import { Section, SectionCount } from "./Section";

/**
 * Open issues - #18 - collapsed by default.
 *
 * Collapsed is a decision about cost, not about importance: the list is only
 * read once the section is opened, and an issue list is background reading
 * rather than something checked before a commit. A call per session for a list
 * nobody looked at is a call spent from the reader's rate limit for nothing.
 *
 * Titles and label names are **text**, written by whoever filed the issue.
 * They go into text nodes; nothing here sets HTML.
 *
 * Presentational: every decision it renders comes from `useIssues`.
 */
export function IssuesSection({ active }: { active: boolean }) {
  const issues = useIssues(active);

  return (
    <Section
      heading={ISSUES_COPY.heading}
      open={issues.open}
      toggle={issues.toggle}
      hint={issues.open ? ISSUES_COPY.hide : ISSUES_COPY.show}
      accessory={<SectionCount count={issues.issues.length} />}
    >
      {issues.error ? (
        <p className="px-2 py-1 text-xs text-danger">{issues.error}</p>
      ) : null}

      {issues.issues.length === 0 ? (
        <p className="px-2 py-1 text-xs text-textFaint">
          {issues.loading ? ISSUES_COPY.loading : ISSUES_COPY.empty}
        </p>
      ) : (
        <ul>
          {issues.issues.map((issue) => (
            <li
              key={issue.number}
              className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-surfaceHover"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-text" title={issue.title}>
                  <span className="text-textFaint">#{issue.number}</span>{" "}
                  {issue.title}
                </span>
                <span className="block truncate text-textFaint">
                  {issue.labels.join(", ")}
                  {issue.labels.length > 0 && issue.updatedMs !== null
                    ? " · "
                    : ""}
                  {issue.updatedMs === null ? "" : relativeTime(issue.updatedMs)}
                </span>
              </span>
              <ExternalLink url={issue.url} title={ISSUES_COPY.open} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
