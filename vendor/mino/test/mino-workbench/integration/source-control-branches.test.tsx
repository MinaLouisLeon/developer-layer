import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import { SourceControlPane } from "@/features/source-control/components/SourceControlPane";

import {
  CLEAN_REPOSITORY,
  createFakeTransport,
  makeBranch,
} from "../fake-transport";
import { openPicker } from "../branch-harness";
import { renderConnected } from "../harness";

/**
 * The branch control: what it lists and what it sends.
 *
 * What is *not* here: whether git actually switches. That is asserted in Rust
 * against real repositories, and the unsaved-draft warning has a suite of its
 * own. These are about the panel.
 */
const BRANCHES = [
  makeBranch("main", { isHead: true, upstream: "origin/main" }),
  makeBranch("dev", { upstream: "origin/dev", ahead: 2, behind: 1 }),
  makeBranch("origin/main", { isRemote: true }),
];

function renderPanel(overrides = {}) {
  const { client } = createFakeTransport({
    repository: CLEAN_REPOSITORY,
    branches: BRANCHES,
    ...overrides,
  });
  renderConnected(<SourceControlPane />, client);
  return client;
}

describe("the branch picker", () => {
  it("lists local and remote branches, and marks the current one", async () => {
    renderPanel();
    await openPicker();

    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining("main"),
      expect.stringContaining("dev"),
      expect.stringContaining("origin/main"),
    ]);
    // The one you are on is marked and cannot be chosen, rather than being
    // hidden - seeing where you are in the list you are choosing from is the
    // point, and a row that vanished would shift the list under the cursor.
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toBeDisabled();
  });

  it("shows how far a branch has drifted from its upstream", async () => {
    renderPanel();
    await openPicker();

    const dev = screen.getByRole("option", { name: /dev/ });
    expect(dev).toHaveTextContent("2");
    expect(dev).toHaveTextContent("1");
    expect(dev).toHaveAccessibleName(/2 ahead/);
    expect(dev).toHaveAccessibleName(/1 behind/);
  });

  it("checks out the branch that was chosen, and only that one", async () => {
    const client = renderPanel();
    const user = await openPicker();

    await user.click(screen.getByRole("option", { name: /dev/ }));

    await waitFor(() => expect(client.git.checkout).toHaveBeenCalledWith("dev"));
    expect(client.git.checkout).toHaveBeenCalledTimes(1);
  });

  it("re-reads the working tree once after a checkout", async () => {
    // One event goes out and every subscriber re-reads. Status is the
    // subscriber this pane can see; the rest are in `git-refresh.test.tsx`.
    const client = renderPanel();
    const status = client.git.status as ReturnType<typeof vi.fn>;
    const before = status.mock.calls.length;
    const user = await openPicker();

    await user.click(screen.getByRole("option", { name: /dev/ }));

    await waitFor(() => expect(status.mock.calls.length).toBeGreaterThan(before));
  });

  it("creates a branch and switches to it in one action", async () => {
    const client = renderPanel();
    const user = await openPicker();

    await user.type(
      screen.getByRole("textbox", { name: /new branch name/i }),
      "feat/thing",
    );
    await user.click(screen.getByRole("button", { name: /create and switch/i }));

    await waitFor(() =>
      expect(client.git.createBranch).toHaveBeenCalledWith({
        name: "feat/thing",
        from: null,
        checkout: true,
      }),
    );
  });

  it("checks out a remote branch by the name git will make local", async () => {
    // `git checkout origin/main` detaches HEAD - it names a commit, not a
    // branch. The short name is what creates a local branch tracking it, and
    // it is what somebody clicking a remote row means.
    const client = renderPanel();
    const user = await openPicker();

    await user.click(screen.getByRole("option", { name: /origin\/main/ }));

    await waitFor(() =>
      expect(client.git.checkout).toHaveBeenCalledWith("main"),
    );
  });

  it("surfaces a failed checkout's own sentence and changes nothing", async () => {
    const client = renderPanel({
      failures: {
        "git.checkout": {
          kind: "invalidArgument",
          detail: {
            message:
              "switching to `dev` would overwrite changes in the working tree.",
          },
        },
      },
    });
    const user = await openPicker();

    await user.click(screen.getByRole("option", { name: /dev/ }));

    // Git's word, not a paraphrase, and the branch strip still says `main`.
    expect(await screen.findByText(/would overwrite changes/i)).toBeVisible();
    expect(client.git.checkout).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /branch: main/i })).toBeVisible();
  });
});
