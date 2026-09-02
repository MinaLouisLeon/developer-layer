import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { FilePayload } from "@/Types";
import { FileTreePane } from "@/features/file-tree/components/FileTreePane";
import { ViewerPane } from "@/features/viewer/components/ViewerPane";

import {
  createFakeTransport,
  line,
  makeEntry,
  makeFileDiff,
  makeHunk,
} from "../fake-transport";
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

describe("the viewer's diff mode", () => {
  it("renders additions and removals distinctly", async () => {
    renderViewer(CHANGED);
    const user = userEvent.setup();
    await openFile(user);
    await user.click(screen.getByRole("button", { name: "Diff" }));

    // The tone is on the row, not on the text span inside it.
    const added = (await screen.findByText("is here now")).closest("div");
    const removed = screen.getByText("was here").closest("div");
    // Both tones are named tokens from `tokens.ts`, never inline colours.
    expect(added?.className).toContain("diffAdded");
    expect(removed?.className).toContain("diffRemoved");
    expect(added?.className).not.toContain("diffRemoved");
  });

  it("says which lines are which, for a reader who cannot see the colour", async () => {
    renderViewer(CHANGED);
    const user = userEvent.setup();
    await openFile(user);
    await user.click(screen.getByRole("button", { name: "Diff" }));

    expect(await screen.findAllByText("added")).not.toHaveLength(0);
    expect(screen.getAllByText("removed")).not.toHaveLength(0);
  });

  it("says so instead of rendering when the file is binary", async () => {
    renderViewer({
      diff: {
        files: [makeFileDiff("logo.bin", { binary: true, hunks: [] })],
        truncated: false,
      },
    });
    const user = userEvent.setup();
    await openFile(user);
    await user.click(screen.getByRole("button", { name: "Diff" }));

    expect(await screen.findByText("Binary file")).toBeInTheDocument();
  });

  it("renders a quiet state when the file has no changes", async () => {
    renderViewer();
    const user = userEvent.setup();
    await openFile(user);
    await user.click(screen.getByRole("button", { name: "Diff" }));

    expect(await screen.findByText("No changes")).toBeInTheDocument();
  });

  it("says when a diff was cut short", async () => {
    renderViewer({
      diff: { files: [makeFileDiff("main.rs")], truncated: true },
    });
    const user = userEvent.setup();
    await openFile(user);
    await user.click(screen.getByRole("button", { name: "Diff" }));

    expect(
      await screen.findByText(/longer than the viewer will show/),
    ).toBeInTheDocument();
  });

  it("shows both line numbers, from the parser rather than by counting", async () => {
    renderViewer({
      diff: {
        files: [
          makeFileDiff("main.rs", {
            hunks: [
              makeHunk({
                oldStart: 40,
                newStart: 41,
                lines: [line("context", "at forty", 40, 41)],
              }),
            ],
          }),
        ],
        truncated: false,
      },
    });
    const user = userEvent.setup();
    await openFile(user);
    await user.click(screen.getByRole("button", { name: "Diff" }));

    await screen.findByText("at forty");
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("41")).toBeInTheDocument();
  });
});
