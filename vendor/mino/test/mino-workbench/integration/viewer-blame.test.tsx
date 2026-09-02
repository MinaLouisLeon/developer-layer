import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { FilePayload, GitBlameLine } from "@/Types";
import { FileTreePane } from "@/features/file-tree/components/FileTreePane";
import { ViewerPane } from "@/features/viewer/components/ViewerPane";

import { createFakeTransport, makeEntry } from "../fake-transport";
import { renderConnected } from "../harness";

const FILE: FilePayload = {
  path: "/root/main.rs",
  size: 20,
  encoding: "utf8",
  content: "alpha\nbeta\ngamma\n",
  extension: "rs",
  modifiedMs: 1,
};

function blameLine(line: number, sha: string, author: string): GitBlameLine {
  return {
    line,
    sha: sha.padEnd(40, "0"),
    shortSha: sha,
    author,
    timestampMs: 1_700_000_000_000,
    summary: `work by ${author}`,
  };
}

/** Two lines from one commit, then one from another. */
const BLAME = {
  blame: {
    relativePath: "main.rs",
    lines: [
      blameLine(1, "3f2a1c9", "Ada Lovelace"),
      blameLine(2, "3f2a1c9", "Ada Lovelace"),
      blameLine(3, "9b8c7d6", "Alan Turing"),
    ],
    truncated: false,
  },
};

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
 * Opens the one file and waits for the *editor* to exist - the CodeMirror view
 * is created in an effect a render after the content arrives.
 */
async function openFile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("treeitem", { name: /main\.rs/ }));
  await screen.findByRole("button", { name: "Blame" });
  await waitFor(() =>
    expect(document.querySelector(".cm-content")).not.toBeNull(),
  );
}

describe("the blame gutter", () => {
  it("reads nothing until it is asked to", async () => {
    // Blame is the most expensive read on the transport. Opening a file must
    // not trigger it.
    const client = renderViewer(BLAME);
    await openFile(userEvent.setup());
    expect(client.git.blame).not.toHaveBeenCalled();
  });

  it("renders authorship once it is turned on, and stops when turned off", async () => {
    const client = renderViewer(BLAME);
    const user = userEvent.setup();
    await openFile(user);

    await user.click(screen.getByRole("button", { name: "Blame" }));
    await waitFor(() =>
      expect(client.git.blame).toHaveBeenCalledWith("/root/main.rs"),
    );
    await waitFor(() =>
      expect(document.querySelector(".cm-blame-gutter")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Blame" }));
    await waitFor(() =>
      expect(document.querySelector(".cm-blame-gutter")).not.toBeInTheDocument(),
    );
  });

  it("collapses repeated authorship so only the changes show", async () => {
    // Two lines from one commit, then one from another: two markers, not
    // three. Repeating the author on every line would hide the thing worth
    // seeing, which is where authorship changes.
    renderViewer(BLAME);
    const user = userEvent.setup();
    await openFile(user);
    await user.click(screen.getByRole("button", { name: "Blame" }));

    await waitFor(() =>
      expect(document.querySelectorAll(".cm-blame-entry")).toHaveLength(2),
    );
    const labels = [...document.querySelectorAll(".cm-blame-entry")].map(
      (element) => element.textContent,
    );
    expect(labels[0]).toContain("Ada");
    expect(labels[0]).toContain("3f2a1c9");
    expect(labels[1]).toContain("Alan");
  });

  it("is not offered in diff mode, where there are no lines to attribute", async () => {
    renderViewer(BLAME);
    const user = userEvent.setup();
    await openFile(user);

    await user.click(screen.getByRole("button", { name: "Diff" }));
    expect(
      screen.queryByRole("button", { name: "Blame" }),
    ).not.toBeInTheDocument();
  });

  it("surfaces a failed blame without taking the editor down", async () => {
    const client = renderViewer({
      failures: {
        "git.blame": {
          kind: "shell",
          detail: { message: "no such path in HEAD" },
        },
      },
    });
    const user = userEvent.setup();
    await openFile(user);
    await user.click(screen.getByRole("button", { name: "Blame" }));

    expect(await screen.findByText(/no such path in HEAD/)).toBeInTheDocument();
    // The file is still readable underneath the notice.
    expect(document.querySelector(".cm-content")?.textContent).toContain("alpha");
    expect(client.git.blame).toHaveBeenCalled();
  });
});
