import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { FilePayload } from "@/Types";
import { FileTreePane } from "@/features/file-tree/components/FileTreePane";
import { ViewerPane } from "@/features/viewer/components/ViewerPane";

import { createFakeTransport, makeEntry, makeFileDiff } from "../fake-transport";
import { renderConnected } from "../harness";

const FILE: FilePayload = {
  path: "/root/main.rs",
  size: 40,
  encoding: "utf8",
  // Deliberately unlike the diff's own lines: the editor stays in the DOM
  // while the diff shows, so a shared string would match in two places.
  content: "alpha\nbeta\n",
  extension: "rs",
  modifiedMs: 1,
};

/**
 * The tree beside the viewer, so a file is opened the way a person opens one.
 * The same shape `viewer-pane.test.tsx` uses.
 */
function renderViewer(overrides: Parameters<typeof createFakeTransport>[0] = {}) {
  const { client } = createFakeTransport({
    listings: { "/root": [makeEntry("/root/main.rs")] },
    files: { "/root/main.rs": FILE },
    ...overrides,
  });
  renderConnected(
    <>
      <FileTreePane />
      <ViewerPane />
    </>,
    client,
  );
  return client;
}

/**
 * Opens the one file in the tree and waits for the *editor* to exist.
 *
 * Waiting for the toolbar is not enough: the CodeMirror view is created in an
 * effect a render after the content arrives, so a test that queried for it
 * immediately would find nothing about one run in three.
 */
async function openFile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("treeitem", { name: /main\.rs/ }));
  await screen.findByRole("button", { name: "Diff" });
  await waitFor(() =>
    expect(document.querySelector(".cm-content")).not.toBeNull(),
  );
}

/** A one-file diff with one added and one removed line. */
const CHANGED = {
  diff: { files: [makeFileDiff("main.rs")], truncated: false },
};

/**
 * The mode toggle itself: what it costs to switch, and what must survive it.
 * How a diff *renders* is in `viewer-diff.test.tsx`.
 */
describe("the viewer's mode toggle", () => {
  it("shows the file's contents until asked for the diff", async () => {
    const client = renderViewer(CHANGED);
    await openFile(userEvent.setup());
    // Nothing is read until the mode is chosen: a diff on every selection
    // would be a git call per click.
    expect(client.git.diff).not.toHaveBeenCalled();
  });

  it("keeps an unsaved draft through a trip into diff mode and back", async () => {
    // The sharpest integration risk in the phase: the editor is *hidden* when
    // the diff shows, never unmounted, so nothing typed can be lost by looking
    // at what changed.
    renderViewer(CHANGED);
    const user = userEvent.setup();
    await openFile(user);

    const editor = document.querySelector(".cm-content") as HTMLElement;
    await user.click(editor);
    await user.keyboard("typed but not saved");
    await waitFor(() =>
      expect(editor.textContent).toContain("typed but not saved"),
    );

    await user.click(screen.getByRole("button", { name: "Diff" }));
    await screen.findByText("is here now");
    await user.click(screen.getByRole("button", { name: "File" }));

    // The *same DOM node*, not an equivalent one. This is the invariant the
    // whole arrangement rests on: a rebuilt editor would restore the document
    // from `draft` and look identical here while having lost the cursor, so
    // asserting on the text alone would pass for the wrong reason.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "File" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(document.querySelector(".cm-content")).toBe(editor);
    expect(editor.textContent).toContain("typed but not saved");
  });
});
