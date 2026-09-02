import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SourceControlPane } from "@/features/source-control/components/SourceControlPane";

import {
  CLEAN_REPOSITORY,
  createFakeTransport,
  makeGitEntry,
} from "../fake-transport";
import { renderConnected } from "../harness";

/** A tree with one staged file, one unstaged, and one untracked. */
const MIXED = [
  makeGitEntry("/root/staged.rs", { index: "added", worktree: "unmodified" }),
  makeGitEntry("/root/src/edited.rs", { worktree: "modified" }),
  makeGitEntry("/root/notes.txt", {
    index: "untracked",
    worktree: "untracked",
  }),
];

function renderPanel(entries = MIXED) {
  const { client } = createFakeTransport({
    repository: CLEAN_REPOSITORY,
    status: { entries },
  });
  renderConnected(<SourceControlPane />, client);
  return client;
}

describe("the source control panel", () => {
  it("groups staged and unstaged changes with their counts", async () => {
    renderPanel();

    const staged = await screen.findByRole("region", {
      name: "Staged changes",
    });
    const changes = screen.getByRole("region", { name: "Changes" });

    expect(staged).toHaveTextContent("staged.rs");
    expect(staged).toHaveTextContent("1");
    // Two rows: the edited file and the untracked one.
    expect(changes).toHaveTextContent("edited.rs");
    expect(changes).toHaveTextContent("notes.txt");
    expect(changes).toHaveTextContent("2");
  });

  it("shows a file that is staged and then modified again in both groups", async () => {
    // The condition the two-state shape exists for. Showing it once would
    // mean picking a side and lying about the other.
    renderPanel([
      makeGitEntry("/root/both.rs", { index: "added", worktree: "modified" }),
    ]);

    const staged = await screen.findByRole("region", {
      name: "Staged changes",
    });
    expect(staged).toHaveTextContent("both.rs");
    expect(screen.getByRole("region", { name: "Changes" })).toHaveTextContent(
      "both.rs",
    );
  });





  it("opens a row's file in the viewer, like the tree and the search results", async () => {
    renderPanel();
    const user = userEvent.setup();

    const row = await screen.findByRole("button", { name: /edited\.rs/ });
    await user.click(row);

    // Selection is the shared `SelectionContext`, and the row shows it: the
    // path turns accent-coloured, exactly as a selected tree row does.
    await waitFor(() =>
      expect(screen.getByText("edited.rs")).toHaveClass("text-accentStrong"),
    );
  });

  it("puts the scrolling in one place, not two", async () => {
    // Regression: the root is `relative` so the discard confirmation can cover
    // this pane. A positioned box reports its scrollable descendants' content
    // in its own `scrollHeight`, so `Pane`'s body grew a second scrollbar
    // beside the list's. `overflow-hidden` on the root is what settles it -
    // the two children already add up to exactly its height.
    renderPanel();
    await screen.findByRole("region", { name: "Staged changes" });

    const pane = screen.getByRole("region", { name: "Source control" });
    const root = pane.querySelector("div > div");
    expect(root).toHaveClass("relative", "overflow-hidden");

    // Exactly one element inside the pane may scroll vertically: the list.
    const scrollers = [...pane.querySelectorAll("*")].filter((el) =>
      el.className.toString().includes("overflow-y-auto"),
    );
    expect(scrollers).toHaveLength(1);
  });

  it("says so plainly when the tree is clean", async () => {
    renderPanel([]);
    expect(await screen.findByText("Nothing to commit")).toBeInTheDocument();
  });

  it("renders a quiet state, and no controls, outside a repository", async () => {
    const { client } = createFakeTransport();
    renderConnected(<SourceControlPane />, client);

    expect(await screen.findByText("Not a repository")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Stage all" }),
    ).not.toBeInTheDocument();
  });
});
