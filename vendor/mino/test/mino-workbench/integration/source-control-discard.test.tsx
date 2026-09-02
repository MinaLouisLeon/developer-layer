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

/**
 * Discard is the one action in this app that destroys work outright - no
 * commit, no stash, no reflog entry. Every rule that guards it is asserted
 * here, because each of them is the difference between an undo and a loss.
 */
const CHANGES = [
  makeGitEntry("/root/src/edited.rs", { worktree: "modified" }),
  makeGitEntry("/root/also.rs", { worktree: "modified" }),
  makeGitEntry("/root/notes.txt", {
    index: "untracked",
    worktree: "untracked",
  }),
];

function renderPanel(entries = CHANGES) {
  const { client } = createFakeTransport({
    repository: CLEAN_REPOSITORY,
    status: { entries },
  });
  renderConnected(<SourceControlPane />, client);
  return client;
}

describe("discarding changes", () => {
  it("asks first, names the file, and names the button after the consequence", async () => {
    const client = renderPanel();
    const user = userEvent.setup();

    await user.click(
      (await screen.findAllByRole("button", {
        name: "Discard changes to this file",
      }))[0],
    );

    expect(
      await screen.findByRole("alertdialog", { name: "Discard changes?" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/The changes to also\.rs/)).toBeInTheDocument();
    // "Discard also.rs", not "OK": a reader who skipped the sentence still
    // sees the consequence on the button they are about to press.
    expect(
      screen.getByRole("button", { name: "Discard also.rs" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "OK" })).not.toBeInTheDocument();
    // And nothing has happened yet.
    expect(client.git.discard).not.toHaveBeenCalled();
  });

  it("does nothing when the confirmation is dismissed", async () => {
    const client = renderPanel();
    const user = userEvent.setup();

    await user.click(
      (await screen.findAllByRole("button", {
        name: "Discard changes to this file",
      }))[0],
    );
    await user.click(screen.getByRole("button", { name: "Keep my changes" }));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(client.git.discard).not.toHaveBeenCalled();
  });

  it("discards only the confirmed path", async () => {
    const client = renderPanel();
    const user = userEvent.setup();

    await user.click(
      (await screen.findAllByRole("button", {
        name: "Discard changes to this file",
      }))[0],
    );
    await user.click(screen.getByRole("button", { name: "Discard also.rs" }));

    await waitFor(() =>
      expect(client.git.discard).toHaveBeenCalledWith(["/root/also.rs"]),
    );
  });

  it("confirms discard-all with a count, and excludes untracked files", async () => {
    const client = renderPanel();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Discard all" }));
    expect(await screen.findByText(/changes to 2 files/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Discard 2 files" }));
    await waitFor(() =>
      // The untracked file is not in the list: there is nothing to restore it
      // from, so the panel never offers to remove it.
      expect(client.git.discard).toHaveBeenCalledWith([
        "/root/also.rs",
        "/root/src/edited.rs",
      ]),
    );
  });

  it("offers no discard control on an untracked file", async () => {
    renderPanel([
      makeGitEntry("/root/notes.txt", {
        index: "untracked",
        worktree: "untracked",
      }),
    ]);

    expect(await screen.findByText("notes.txt")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Discard changes to this file" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the confirmation focused on the safe choice", async () => {
    renderPanel();
    const user = userEvent.setup();

    await user.click(
      (await screen.findAllByRole("button", {
        name: "Discard changes to this file",
      }))[0],
    );

    // Enter should keep your work, not destroy it.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Keep my changes" })).toHaveFocus(),
    );
  });
});
