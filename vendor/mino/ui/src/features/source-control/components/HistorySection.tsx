import { GIT_BADGE_CLASSES, GIT_BADGES } from "@/features/git/badges";
import { absoluteTime, relativeTime } from "@/lib/relativeTime";

import { useHistory } from "../hooks/useHistory";
import { SOURCE_CONTROL_COPY } from "../messages";

/**
 * The History list: subject, author, when, and the short sha.
 *
 * Presentational. Expanding a commit shows the files it touched; choosing one
 * opens that file *at that commit* in the viewer, which is the whole point of
 * the list - reading history means reading the change, not the name of it.
 */
export function HistorySection({ active }: { active: boolean }) {
  const history = useHistory(active);

  if (history.error) {
    return (
      <p className="px-2 py-1 text-xs text-danger">{history.error}</p>
    );
  }
  if (history.commits.length === 0) {
    return (
      <p className="px-2 py-1 text-xs text-textFaint">
        {history.loading
          ? SOURCE_CONTROL_COPY.historyLoading
          : SOURCE_CONTROL_COPY.historyEmpty}
      </p>
    );
  }

  return (
    <section aria-label={SOURCE_CONTROL_COPY.history} className="py-1">
      <header className="flex items-center gap-2 px-2 py-1">
        <h3 className="text-xs font-medium uppercase tracking-wide text-textMuted">
          {SOURCE_CONTROL_COPY.history}
        </h3>
      </header>

      {history.commits.map((commit) => {
        const open = commit.sha === history.openSha;
        return (
          <div key={commit.sha}>
            <button
              type="button"
              onClick={() => history.openCommit(commit.sha)}
              aria-expanded={open}
              title={commit.summary}
              className={`flex w-full flex-col items-start gap-0.5 px-2 py-1 text-left text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong ${
                open ? "bg-accentMuted" : "hover:bg-surfaceHover"
              }`}
            >
              <span className="w-full truncate text-text">{commit.summary}</span>
              <span className="flex w-full items-center gap-2 text-xs text-textFaint">
                <span className="truncate">{commit.author}</span>
                <span
                  className="shrink-0"
                  title={absoluteTime(commit.timestampMs)}
                >
                  {relativeTime(commit.timestampMs)}
                </span>
                <span className="ml-auto shrink-0 font-mono">
                  {commit.shortSha}
                </span>
              </span>
            </button>

            {open ? <CommitFiles history={history} /> : null}
          </div>
        );
      })}

      {history.more ? (
        <button
          type="button"
          onClick={history.loadMore}
          disabled={history.loading}
          className="w-full px-2 py-1 text-left text-xs text-textMuted hover:bg-surfaceHover hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong disabled:opacity-50"
        >
          {history.loading
            ? SOURCE_CONTROL_COPY.historyLoading
            : SOURCE_CONTROL_COPY.showMore}
        </button>
      ) : null}
    </section>
  );
}

/** The open commit's files. Choosing one shows its diff in the viewer. */
function CommitFiles({ history }: { history: ReturnType<typeof useHistory> }) {
  if (!history.files) {
    return (
      <p className="px-2 py-1 pl-6 text-xs text-textFaint">
        {SOURCE_CONTROL_COPY.historyLoading}
      </p>
    );
  }
  if (history.files.length === 0) {
    return (
      <p className="px-2 py-1 pl-6 text-xs text-textFaint">
        {SOURCE_CONTROL_COPY.commitTouchedNothing}
      </p>
    );
  }

  return (
    <ul>
      {history.files.map((file) => {
        const badge = GIT_BADGES[file.state];
        return (
          <li key={`${file.relativePath}:${file.state}`}>
            <button
              type="button"
              onClick={() => history.openFile(file)}
              title={file.oldPath ?? file.relativePath}
              className="flex w-full items-center gap-2 py-0.5 pl-6 pr-2 text-left text-xs hover:bg-surfaceHover focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
            >
              <span className="min-w-0 flex-1 truncate text-textMuted">
                {file.relativePath}
              </span>
              {badge ? (
                <span
                  className={`shrink-0 font-semibold ${GIT_BADGE_CLASSES[badge.tone]}`}
                  title={badge.label}
                >
                  <span aria-hidden="true">{badge.letter}</span>
                  <span className="sr-only">{badge.label}</span>
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
