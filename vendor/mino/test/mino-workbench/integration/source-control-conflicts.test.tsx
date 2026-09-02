import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SourceControlPane } from "@/features/source-control/components/SourceControlPane";

import {
  CLEAN_REPOSITORY,
  createFakeTransport,
  makeConflict,
  makeGitEntry,
} from "../fake-transport";
import { renderConnected } from "../harness";

/**
 * Conflicts - #13.
 *
 * Two things are asserted, and the second is the one that keeps somebody out
 * of trouble. The first is that conflicted files render distinctly and settle.
 * The second is that **the commit box says why it is unavailable**: "nothing
 * happens when I press commit" is a bad way to learn that a merge is
 * outstanding, and "stage something" - which is what the box would otherwise
 * say - would send the reader the wrong way entirely.
 */
function renderPanel(overrides = {}) {
  const fake = createFakeTransport({
    repository: CLEAN_REPOSITORY,
    status: {
      entries: [
        makeGitEntry("/root/a.txt", {
          index: "conflicted",
          worktree: "conflicted",
        }),
      ],
    },
    conflicts: [makeConflict("a.txt")],
    ...overrides,
  });
  renderConnected(<SourceControlPane />, fake.client);
  return fake;
}

describe("conflicted files", () => {
  it("lists each one and says which kind of conflict it is", async () => {
    renderPanel({
      conflicts: [
        makeConflict("a.txt", "bothModified"),
        makeConflict("gone.txt", "deletedByThem"),
      ],
    });

    expect(await screen.findByText("a.txt")).toBeInTheDocument();
    // The kind is the point: "keep the incoming version" means keep a file in
    // one row and delete a file in the other.
    expect(
      await screen.findByText("Both sides changed this"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/The other side deleted this/),
    ).toBeInTheDocument();
  });

  it("names which version each control keeps, not git's words", async () => {
    // "ours" and "theirs" are a translation step, and translating them wrong
    // throws away the wrong side of somebody's work.
    renderPanel();
    expect(
      await screen.findByRole("button", { name: "Keep this branch's version" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Keep the incoming version" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/theirs/i)).not.toBeInTheDocument();
  });

  it("sends the resolution the reader chose, for the row they chose", async () => {
    const user = userEvent.setup();
    const fake = renderPanel({
      conflicts: [makeConflict("a.txt"), makeConflict("b.txt")],
    });

    const rows = await screen.findAllByRole("button", {
      name: "Keep the incoming version",
    });
    await user.click(rows[1]);

    await waitFor(() => expect(fake.resolutions).toHaveLength(1));
    expect(fake.resolutions[0]).toEqual(["/root/b.txt", "theirs"]);
  });

  it("offers editing the file only where both sides have one", async () => {
    renderPanel({ conflicts: [makeConflict("gone.txt", "bothDeleted")] });
    await screen.findByText("gone.txt");
    // There is nothing to open, edit and mark settled when the choice is
    // between a file and no file.
    expect(
      screen.queryByRole("button", { name: "Mark as settled" }),
    ).not.toBeInTheDocument();
  });

  it("takes the file as it stands when marked settled", async () => {
    const user = userEvent.setup();
    const fake = renderPanel();

    await user.click(
      await screen.findByRole("button", { name: "Mark as settled" }),
    );
    await waitFor(() => expect(fake.resolutions).toHaveLength(1));
    expect(fake.resolutions[0]).toEqual(["/root/a.txt", "manual"]);
  });

  it("disables the commit button and says why", async () => {
    renderPanel();

    // Not "stage something", which is what the box says the rest of the time
    // and would send the reader the wrong way.
    expect(
      await screen.findByText("Settle the conflicts above before committing."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Commit/ })).toBeDisabled();
  });

  it("shows nothing at all when nothing is conflicted", async () => {
    // The section appears when it has something to say, which is why it is
    // neither collapsible nor read on demand.
    const fake = createFakeTransport({ repository: CLEAN_REPOSITORY });
    renderConnected(<SourceControlPane />, fake.client);

    await screen.findByText("Nothing to commit");
    expect(screen.queryByLabelText("Conflicts")).not.toBeInTheDocument();
    // And no call was made for it: a clean status has no conflicted entry, so
    // there is nothing to ask about.
    expect(fake.client.git.conflicts).not.toHaveBeenCalled();
  });
});
