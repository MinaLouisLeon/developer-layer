import { describe, expect, it, vi } from "vitest";
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
 * What the staging controls send, and what happens after they send it.
 *
 * The assertions are about the *exact* paths: a control that stages more than
 * the row it sits on is a control that stages work somebody was not ready to
 * commit. Rendering and grouping are in `source-control.test.tsx`.
 */
const MIXED = [
  makeGitEntry("/root/staged.rs", { index: "added", worktree: "unmodified" }),
  makeGitEntry("/root/src/edited.rs", { worktree: "modified" }),
  makeGitEntry("/root/notes.txt", {
    index: "untracked",
    worktree: "untracked",
  }),
];

function renderPanel() {
  const { client } = createFakeTransport({
    repository: CLEAN_REPOSITORY,
    status: { entries: MIXED },
  });
  renderConnected(<SourceControlPane />, client);
  return client;
}

describe("the staging controls", () => {
  it("stages exactly the row that was clicked", async () => {
    const client = renderPanel();
    const user = userEvent.setup();

    const stage = await screen.findAllByRole("button", {
      name: "Stage this file",
    });
    await user.click(stage[0]);

    await waitFor(() => expect(client.git.stage).toHaveBeenCalled());
    expect(client.git.stage).toHaveBeenCalledWith(["/root/notes.txt"]);
    expect(client.git.unstage).not.toHaveBeenCalled();
  });

  it("unstages exactly the row that was clicked", async () => {
    const client = renderPanel();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Unstage this file" }),
    );

    await waitFor(() => expect(client.git.unstage).toHaveBeenCalled());
    expect(client.git.unstage).toHaveBeenCalledWith(["/root/staged.rs"]);
  });

  it("sends an empty array for the group-level controls", async () => {
    const client = renderPanel();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Stage all" }));
    await waitFor(() => expect(client.git.stage).toHaveBeenCalledWith([]));

    await user.click(screen.getByRole("button", { name: "Unstage all" }));
    await waitFor(() => expect(client.git.unstage).toHaveBeenCalledWith([]));
  });

  it("re-reads the working tree after every action", async () => {
    const client = renderPanel();
    const user = userEvent.setup();
    const before = (client.git.status as ReturnType<typeof vi.fn>).mock.calls
      .length;

    await user.click(
      await screen.findByRole("button", { name: "Unstage this file" }),
    );

    await waitFor(() =>
      expect(
        (client.git.status as ReturnType<typeof vi.fn>).mock.calls.length,
      ).toBeGreaterThan(before),
    );
  });

  it("surfaces a failed action as a sentence and keeps the list", async () => {
    const { client } = createFakeTransport({
      repository: CLEAN_REPOSITORY,
      status: { entries: MIXED },
      failures: {
        "git.stage": {
          kind: "shell",
          detail: { message: "index.lock exists" },
        },
      },
    });
    renderConnected(<SourceControlPane />, client);
    const user = userEvent.setup();

    const stage = await screen.findAllByRole("button", {
      name: "Stage this file",
    });
    await user.click(stage[0]);

    expect(await screen.findByText(/index\.lock exists/)).toBeInTheDocument();
    expect(screen.getByText("staged.rs")).toBeInTheDocument();
  });
});
