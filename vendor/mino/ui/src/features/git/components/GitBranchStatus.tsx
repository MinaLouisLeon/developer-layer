import { useGitStatusContext } from "../context/GitStatusContext";
import { GIT_COPY } from "../messages";

/**
 * The header's git strip: branch, dirty marker, ahead and behind.
 *
 * Takes no props. Everything it renders comes from `GitStatusContext`, which
 * is what keeps `WorkbenchHeader` under the six-prop ceiling - the alternative
 * would have been four more props on a component that already has enough.
 *
 * Renders nothing at all when there is no repository, no git, or nothing read
 * yet. A folder that is not a checkout should look exactly as it did before
 * this feature existed.
 */
export function GitBranchStatus() {
  const { availability, repository, dirty } = useGitStatusContext();

  if (availability === "absent") {
    return (
      <span className="shrink-0 text-xs text-textFaint">{GIT_COPY.absent}</span>
    );
  }
  if (!repository) return null;

  const { branch, head, detached, ahead, behind } = repository;
  // A detached HEAD has no name, and an unborn branch has no commit. Both are
  // real states of a real repository, so each says what it is rather than
  // rendering an empty space.
  const name = detached ? `${GIT_COPY.detached} ${head ?? ""}`.trim() : branch;
  if (!name) return null;

  const title = detached
    ? GIT_COPY.detachedLabel
    : head
      ? undefined
      : GIT_COPY.unbornLabel;

  return (
    <span
      className="flex shrink-0 items-center gap-1.5 text-xs text-textMuted"
      title={title}
    >
      <span aria-hidden="true" className="text-textFaint">
        &#x2387;
      </span>
      <span className={detached ? "text-warning" : undefined}>{name}</span>
      {dirty ? (
        <span className="text-warning" title={GIT_COPY.dirtyLabel}>
          {GIT_COPY.dirtyMarker}
          <span className="sr-only">{GIT_COPY.dirtyLabel}</span>
        </span>
      ) : null}
      {ahead > 0 ? (
        <span title={GIT_COPY.aheadLabel(ahead)}>
          &#x2191;{ahead}
          <span className="sr-only">{GIT_COPY.aheadLabel(ahead)}</span>
        </span>
      ) : null}
      {behind > 0 ? (
        <span title={GIT_COPY.behindLabel(behind)}>
          &#x2193;{behind}
          <span className="sr-only">{GIT_COPY.behindLabel(behind)}</span>
        </span>
      ) : null}
    </span>
  );
}
