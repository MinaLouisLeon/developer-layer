import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { DirEntry, FilePayload } from "@/Types";
import { FileTreePane } from "@/features/file-tree/components/FileTreePane";
import { SearchPane } from "@/features/search/components/SearchPane";
import { SourceControlPane } from "@/features/source-control/components/SourceControlPane";
import { ViewerPane } from "@/features/viewer/components/ViewerPane";

import {
  CLEAN_REPOSITORY,
  createFakeTransport,
  makeBranch,
  makeEntry,
} from "../fake-transport";
import { chooseDev } from "../branch-harness";
import { renderConnected } from "../harness";

/**
 * The refresh contract, tested as a group rather than pane by pane.
 *
 * This is the real work of phase 4. A checkout changes files under the tree,
 * the viewer and the search results at once, and the failure mode it guards
 * against is *one pane forgotten* - stale content with no way for the reader
 * to tell. Four separate tests would each pass while that bug existed; the
 * point is that one event reaches all of them.
 *
 * What each pane does with the event is its own decision, and each is
 * asserted for what it actually promises - the tree re-reads and stays
 * expanded, the viewer re-reads, search clears, status re-reads. The contract
 * is written out in `docs/mino-workbench/git-module.md`.
 */
const README: FilePayload = {
  path: "/root/readme.md",
  size: 5,
  modifiedMs: 1_700_000_000_000,
  encoding: "utf8",
  content: "on main",
  extension: "md",
};

const ENTRY: DirEntry = makeEntry("/root/readme.md");
const BRANCHES = [makeBranch("main", { isHead: true }), makeBranch("dev")];

function renderWorkbench() {
  const { client } = createFakeTransport({
    repository: CLEAN_REPOSITORY,
    branches: BRANCHES,
    listings: { "/root": [ENTRY] },
    files: { "/root/readme.md": README },
    searchable: ["readme.md"],
  });

  renderConnected(
    <>
      <FileTreePane />
      <ViewerPane />
      <SearchPane />
      <SourceControlPane />
    </>,
    client,
  );
  return client;
}

/** A fake's method as the mock it is - the interface type erases that. */
function calls(fn: unknown): number {
  return (fn as ReturnType<typeof vi.fn>).mock.calls.length;
}

/** The tree's row for the file, scoped so the search hit cannot answer for it. */
async function treeRow() {
  // `find`, not `get`: the harness opens its session asynchronously, so
  // nothing is on screen for the first tick of a test.
  const tree = await screen.findByRole("tree");
  return within(tree).findByRole("treeitem", { name: /readme\.md/i });
}

describe("the working tree changing under the panes", () => {
  it("has every pane read again from one checkout", async () => {
    const client = renderWorkbench();
    const user = userEvent.setup();

    // The viewer has to have something open for its promise to mean anything.
    await user.click(await treeRow());
    await waitFor(() => expect(client.readFile).toHaveBeenCalled());

    const before = {
      listDir: calls(client.listDir),
      readFile: calls(client.readFile),
      status: calls(client.git.status),
    };

    await chooseDev();

    // The tree re-reads its loaded folders, the viewer re-reads the open
    // file, and source control re-reads the working tree - all from one click.
    await waitFor(() => expect(calls(client.listDir)).toBeGreaterThan(before.listDir));
    await waitFor(() => expect(calls(client.readFile)).toBeGreaterThan(before.readFile));
    await waitFor(() => expect(calls(client.git.status)).toBeGreaterThan(before.status));
  });

  it("keeps the tree's expansion rather than folding it up", async () => {
    // A reader who has drilled into a tree has not asked for it to collapse
    // because a branch changed.
    const client = renderWorkbench();
    await treeRow();

    await chooseDev();

    await waitFor(() => expect(client.git.checkout).toHaveBeenCalled());
    expect(await treeRow()).toBeVisible();
  });

  it("clears search results, which name paths that may be gone", async () => {
    const client = renderWorkbench();
    const user = userEvent.setup();

    await user.type(
      await screen.findByLabelText("Search files by name"),
      "readme",
    );
    const results = await screen.findByRole("listbox", { name: "Search" });
    expect(within(results).getByRole("option", { name: /readme\.md/i })).toBeVisible();
    const searches = calls(client.searchFiles);

    await chooseDev();
    await waitFor(() => expect(client.git.checkout).toHaveBeenCalled());

    // The list is gone, not merely stale.
    await waitFor(() =>
      expect(screen.queryByRole("listbox", { name: "Search" })).toBeNull(),
    );

    // Cleared, and deliberately *not* re-run: a full walk of the tree is the
    // most expensive thing this pane can do, and a branch switch should not
    // pay for one on behalf of a pane nobody may be looking at.
    await waitFor(() => expect(calls(client.searchFiles)).toBe(searches));
  });
});
