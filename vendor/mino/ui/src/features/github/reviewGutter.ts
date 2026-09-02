import { RangeSet } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { GutterMarker, gutter } from "@codemirror/view";

import type { GitHubReviewThread } from "@/Types";

import { REVIEW_COPY } from "./messages";

/**
 * The review comment gutter - #17.
 *
 * The same CodeMirror machinery the blame gutter uses, and for the same
 * reason: a marker drawn in a gutter scrolls with the document and lines up
 * with it exactly, which a column beside the editor does not.
 *
 * **What it deliberately does not draw is the interesting part.** A review
 * comment is anchored to a position in a *diff*, not to a line in a file, and
 * a thread whose diff is no longer current has no line at all. Those threads
 * are filtered out here rather than pinned to `original_line`, because putting
 * somebody's objection next to whatever now happens to sit at that number is
 * worse than not placing it - the reader would act on it as though it were
 * about the code in front of them.
 *
 * There is a second, quieter version of the same problem that nothing can fix
 * from here: even a current thread's line is a line in the pull request's head
 * commit, and the editor is showing the working tree. If they have drifted,
 * the marker is off. So the gutter is a *pointer* - it says "there is a
 * conversation about roughly here" and opens the panel - and the panel carries
 * the thread's own path and link.
 */
class ThreadMarker extends GutterMarker {
  constructor(
    private readonly count: number,
    private readonly onOpen: () => void,
  ) {
    super();
  }

  eq(other: ThreadMarker): boolean {
    return other.count === this.count;
  }

  toDOM(): HTMLElement {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "cm-review-marker";
    element.textContent = REVIEW_COPY.marker(this.count);
    element.title = REVIEW_COPY.markerHint(this.count);
    element.addEventListener("click", (event) => {
      event.preventDefault();
      this.onOpen();
    });
    return element;
  }
}

/**
 * Builds the extension for one file's threads.
 *
 * Returns an empty array when there is nothing placeable, so the caller can
 * always spread it into the extension list without a conditional - the same
 * shape `blameGutter` has.
 */
export function reviewGutter(
  threads: readonly GitHubReviewThread[],
  onOpen: (line: number) => void,
) {
  const byLine = placeable(threads);
  if (byLine.size === 0) return [];

  return [
    gutter({
      class: "cm-review-gutter",
      lineMarker: (view: EditorView, block) => {
        const line = view.state.doc.lineAt(block.from).number;
        const count = byLine.get(line);
        return count ? new ThreadMarker(count, () => onOpen(line)) : null;
      },
      markers: () => RangeSet.empty,
    }),
  ];
}

/**
 * How many threads sit on each line, counting only the ones that can be
 * placed.
 *
 * The filter is the rule: `outdated` threads and threads with no line are
 * never drawn. It is written once, here, so no caller has to remember it.
 */
export function placeable(
  threads: readonly GitHubReviewThread[],
): ReadonlyMap<number, number> {
  const byLine = new Map<number, number>();
  for (const thread of threads) {
    if (thread.outdated || thread.line === null) continue;
    byLine.set(thread.line, (byLine.get(thread.line) ?? 0) + 1);
  }
  return byLine;
}
