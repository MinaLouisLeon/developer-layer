import { Notice, StatusMessage } from "@/components/ui";

import { VIEWER_COPY } from "../messages";
import type { FileDiffState } from "../types";
import { DiffHunk } from "./DiffLines";

/**
 * The unified diff. Presentational: the hunks arrive already parsed, with the
 * line numbers on both sides worked out in Rust.
 *
 * Read-only by construction - there is nothing here to type into - which is
 * what makes switching modes safe for an unsaved draft.
 */
export function DiffView({ diff }: { diff: FileDiffState }) {
  if (diff.status === "loading") {
    return <StatusMessage title={VIEWER_COPY.diffLoading} />;
  }
  if (diff.status === "error") {
    return (
      <StatusMessage
        title={VIEWER_COPY.diffErrorTitle}
        description={diff.error ?? undefined}
        tone="danger"
      />
    );
  }
  if (!diff.file) {
    return (
      <StatusMessage
        title={VIEWER_COPY.diffEmptyTitle}
        description={VIEWER_COPY.diffEmptyBody}
      />
    );
  }
  if (diff.file.binary) {
    return (
      <StatusMessage
        title={VIEWER_COPY.diffBinaryTitle}
        description={VIEWER_COPY.diffBinaryBody}
      />
    );
  }

  return (
    <div className="h-full overflow-auto">
      {diff.file.oldPath ? (
        <p className="px-2 py-1 font-mono text-xs text-textFaint">
          {VIEWER_COPY.renamedFrom(diff.file.oldPath)}
        </p>
      ) : null}
      {diff.truncated ? (
        <div className="p-2">
          <Notice variant="warning">{VIEWER_COPY.diffTruncated}</Notice>
        </div>
      ) : null}
      {diff.file.hunks.map((hunk) => (
        <DiffHunk key={`${hunk.oldStart}:${hunk.newStart}`} hunk={hunk} />
      ))}
    </div>
  );
}
