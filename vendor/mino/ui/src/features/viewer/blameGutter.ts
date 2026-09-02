import { RangeSet } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { GutterMarker, gutter } from "@codemirror/view";

import type { GitBlameLine } from "@/Types";

/**
 * The blame gutter.
 *
 * A CodeMirror extension rather than a column drawn beside the editor, so it
 * scrolls with the document and lines up with it exactly - which is the whole
 * value of a blame gutter and the one thing a parallel column gets wrong.
 *
 * **Repeated authorship is collapsed.** A block of thirty lines from one
 * commit shows the author once, on its first line. Repeating it thirty times
 * would turn the gutter into noise and hide the thing worth seeing: where
 * authorship *changes*.
 */
class BlameMarker extends GutterMarker {
  constructor(private readonly entry: GitBlameLine) {
    super();
  }

  eq(other: BlameMarker): boolean {
    return other.entry.sha === this.entry.sha;
  }

  toDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = "cm-blame-entry";
    element.textContent = label(this.entry);
    // The gutter is narrow, so the detail lives in the tooltip rather than
    // being truncated into uselessness.
    element.title = `${this.entry.shortSha} · ${this.entry.author} · ${this.entry.summary}`;
    return element;
  }
}

/** Author and short sha, trimmed to something a narrow column can hold. */
function label(entry: GitBlameLine): string {
  const author = entry.author.split(" ")[0] ?? entry.author;
  return `${author.slice(0, 10)} ${entry.shortSha}`;
}

/**
 * Builds the extension for one blame reading.
 *
 * Returns an empty array when there is nothing to show, so the caller can
 * always spread it into the extension list without a conditional.
 */
export function blameGutter(
  byLine: ReadonlyMap<number, GitBlameLine> | null,
) {
  if (!byLine || byLine.size === 0) return [];

  return [
    gutter({
      class: "cm-blame-gutter",
      lineMarker: (view: EditorView, block) => {
        const line = view.state.doc.lineAt(block.from).number;
        const entry = byLine.get(line);
        if (!entry) return null;
        // The collapse: draw only where the commit changes.
        const previous = byLine.get(line - 1);
        if (previous && previous.sha === entry.sha) return null;
        return new BlameMarker(entry);
      },
      // Nothing to reconfigure per update; the set is rebuilt with the view
      // whenever the blame data changes.
      markers: () => RangeSet.empty,
    }),
  ];
}
