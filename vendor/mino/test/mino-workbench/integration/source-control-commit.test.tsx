import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SourceControlPane } from "@/features/source-control/components/SourceControlPane";

import {
  CLEAN_REPOSITORY,
  createFakeTransport,
  makeGitEntry,
} from "../fake-transport";
import type { FakeTransportOptions } from "../fake-transport";
import { renderConnected } from "../harness";

const STAGED = [
  makeGitEntry("/root/staged.rs", { index: "added", worktree: "unmodified" }),
];

function renderPanel(overrides: Partial<FakeTransportOptions> = {}) {
  const { client } = createFakeTransport({
    repository: CLEAN_REPOSITORY,
    status: { entries: STAGED },
    ...overrides,
  });
  renderConnected(<SourceControlPane />, client);
  return client;
}

describe("the commit box", () => {
  it("is unavailable with an empty message, and says why", async () => {
    renderPanel();
    expect(
      await screen.findByText("Write a commit message first."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Commit" })).toBeDisabled();
  });

  it("is unavailable with nothing staged, and says why", async () => {
    renderPanel({
      status: { entries: [makeGitEntry("/root/edited.rs")] },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Commit message"), "a message");

    expect(
      await screen.findByText("Stage something to commit."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Commit" })).toBeDisabled();
  });

  it("commits the typed message and says which commit landed", async () => {
    const client = renderPanel();
    const user = userEvent.setup();

    await user.type(
      await screen.findByLabelText("Commit message"),
      "Fix the thing",
    );
    await user.click(screen.getByRole("button", { name: "Commit" }));

    await waitFor(() =>
      expect(client.git.commit).toHaveBeenCalledWith({
        message: "Fix the thing",
        all: false,
        amend: false,
      }),
    );
    expect(await screen.findByText(/Committed 3f2a1c9/)).toBeInTheDocument();
    // Cleared only after it landed.
    expect(screen.getByLabelText("Commit message")).toHaveValue("");
  });

  it("commits on Ctrl+Enter", async () => {
    const client = renderPanel();
    const user = userEvent.setup();

    const box = await screen.findByLabelText("Commit message");
    await user.type(box, "Via the keyboard");
    await user.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => expect(client.git.commit).toHaveBeenCalled());
  });

  it("keeps the typed message when the commit fails", async () => {
    // The message is the only copy there is. Losing a paragraph of typing to
    // a missing `user.email` would be unrecoverable.
    const client = renderPanel({
      failures: {
        "git.commit": {
          kind: "shell",
          detail: { message: "git does not know who you are" },
        },
      },
    });
    const user = userEvent.setup();

    await user.type(
      await screen.findByLabelText("Commit message"),
      "Work I do not want to retype",
    );
    await user.click(screen.getByRole("button", { name: "Commit" }));

    expect(
      await screen.findByText(/git does not know who you are/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Commit message")).toHaveValue(
      "Work I do not want to retype",
    );
    expect(client.git.commit).toHaveBeenCalledTimes(1);
  });

  it("re-reads the working tree after a commit", async () => {
    const client = renderPanel();
    const user = userEvent.setup();
    const status = client.git.status as ReturnType<typeof vi.fn>;
    const before = status.mock.calls.length;

    await user.type(await screen.findByLabelText("Commit message"), "Done");
    await user.click(screen.getByRole("button", { name: "Commit" }));

    await waitFor(() =>
      expect(status.mock.calls.length).toBeGreaterThan(before),
    );
  });
});
