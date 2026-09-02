import type { GitDiffLine, GitDiffLineKind, GitHunk } from "@/Types";

import { VIEWER_COPY } from "../messages";

/**
 * Row wash and gutter sign per line kind. Named tokens only - `tokens.ts` is
 * the one file allowed to hold a colour, and the diff pair was added there
 * rather than borrowing `accent` and `danger`: an added line is not a success
 * and a removed one is not an error.
 */
const KIND_CLASSES: Record<GitDiffLineKind, string> = {
  added: "bg-diffAddedLine text-diffAdded",
  removed: "bg-diffRemovedLine text-diffRemoved",
  context: "text-textMuted",
};

const SIGN: Record<GitDiffLineKind, string> = {
  added: "+",
  removed: "-",
  context: " ",
};

/** The two line numbers, in a fixed-width column so the code stays aligned. */
function LineNumber({ value }: { value: number | null }) {
  return (
    <span className="w-10 shrink-0 select-none pr-2 text-right text-textFaint">
      {value ?? ""}
    </span>
  );
}

function DiffLineRow({ line }: { line: GitDiffLine }) {
  return (
    <div className={`flex whitespace-pre font-mono text-xs ${KIND_CLASSES[line.kind]}`}>
      <LineNumber value={line.oldLine} />
      <LineNumber value={line.newLine} />
      <span aria-hidden="true" className="w-4 shrink-0 select-none text-center">
        {SIGN[line.kind]}
      </span>
      {/* The sign is decorative, so the kind is said in words for a reader
          who cannot see the colour either. */}
      <span className="sr-only">{VIEWER_COPY.diffLineKind[line.kind]}</span>
      <span className="min-w-0 flex-1 break-all">{line.content || "\u00a0"}</span>
      {line.noNewline ? (
        <span className="shrink-0 pl-2 text-textFaint">
          {VIEWER_COPY.noNewline}
        </span>
      ) : null}
    </div>
  );
}

/** One `@@` block: its header, then its lines. */
export function DiffHunk({ hunk }: { hunk: GitHunk }) {
  return (
    <section aria-label={hunkLabel(hunk)}>
      <header className="sticky top-0 flex whitespace-pre bg-surfaceRaised px-2 py-0.5 font-mono text-xs text-textFaint">
        {`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`}
        {hunk.header ? ` ${hunk.header}` : ""}
      </header>
      {hunk.lines.map((line, index) => (
        // Index is the key on purpose: a diff line has no identity of its own,
        // and the list is replaced wholesale whenever the diff is re-read.
        <DiffLineRow key={index} line={line} />
      ))}
    </section>
  );
}

function hunkLabel(hunk: GitHunk): string {
  const at = `lines ${hunk.newStart} to ${hunk.newStart + hunk.newLines}`;
  return hunk.header ? `${at}, ${hunk.header}` : at;
}
