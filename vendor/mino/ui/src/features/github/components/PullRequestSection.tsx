import { usePullRequests } from "../hooks/usePullRequests";
import { PULL_REQUESTS_COPY } from "../messages";
import { PullRequestRow } from "./PullRequestRow";
import { Section, SectionCount } from "./Section";

/**
 * Open pull requests - #15 - and the description of the one being looked at.
 *
 * The description is shown **inline, under its row**, rather than replacing
 * the list. A pull request is usually being read in relation to the others,
 * and a detail view that took over the pane would make comparing two of them a
 * matter of remembering the first.
 *
 * The body is rendered inside `whitespace-pre-wrap` and nothing else. It is
 * Markdown, and it is Markdown written by whoever opened the pull request: a
 * renderer here would be a renderer pointed at untrusted input, for a body
 * that is one click from being read on github.com properly.
 *
 * Presentational: every decision it renders comes from `usePullRequests`.
 */
export function PullRequestSection({ active }: { active: boolean }) {
  const pulls = usePullRequests(active);

  return (
    <Section
      heading={PULL_REQUESTS_COPY.heading}
      open={pulls.open}
      toggle={pulls.toggle}
      hint={pulls.open ? PULL_REQUESTS_COPY.hide : PULL_REQUESTS_COPY.show}
      accessory={<SectionCount count={pulls.pulls.length} />}
    >
      {pulls.error ? (
        <p className="px-2 py-1 text-xs text-danger">{pulls.error}</p>
      ) : null}

      {pulls.pulls.length === 0 ? (
        <p className="px-2 py-1 text-xs text-textFaint">
          {pulls.loading ? PULL_REQUESTS_COPY.loading : PULL_REQUESTS_COPY.empty}
        </p>
      ) : (
        <ul>
          {pulls.pulls.map((pull) => (
            <li key={pull.number}>
              <PullRequestRow
                pull={pull}
                selected={pulls.selected === pull.number}
                onSelect={pulls.select}
              />
              {pulls.selected === pull.number ? (
                <div className="border-l-2 border-border px-3 py-1 text-xs text-textMuted">
                  {pulls.detailLoading ? (
                    <p className="text-textFaint">
                      {PULL_REQUESTS_COPY.detailLoading}
                    </p>
                  ) : pulls.detail?.body ? (
                    // Text, never markup. See the component doc above.
                    <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                      {pulls.detail.body}
                    </p>
                  ) : (
                    <p className="text-textFaint">{PULL_REQUESTS_COPY.noBody}</p>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
