import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SourceControlPane } from "@/features/source-control/components/SourceControlPane";

import {
  CLEAN_REPOSITORY,
  createFakeTransport,
  makeStash,
} from "../fake-transport";
import { renderConnected } from "../harness";

/**
 * Setting work aside, and what happens when it cannot be brought back cleanly.
 *
 * Split from `source-control-stash.test.tsx`, which is about the list and its
 * per-entry controls. These are the *push* half, and the one failure the
 * reader most needs a straight answer to: a pop that conflicted has left the
 * entry exactly where it was.
 */
const STASHES = [makeStash(0, { message: "half a refactor", branch: "dev" })];

function renderPanel(overrides = {}) {
  const { client } = createFakeTransport({
    repository: CLEAN_REPOSITORY,
    stashes: STASHES,
    ...overrides,
  });
  renderConnected(<SourceControlPane />, client);
  return client;
}

/** Expands the section, which is collapsed by default. */
async function openStash() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /^stash$/i }));
  return user;
}

describe("setting work aside", () => {
  it("stashes what was typed, and leaves untracked files alone by default", async () => {
    const client = renderPanel();
    const user = await openStash();

    await user.type(
      screen.getByRole("textbox", { name: /stash message/i }),
      "a spike",
    );
    await user.click(screen.getByRole("button", { name: /stash changes/i }));

    await waitFor(() =>
      expect(client.git.stashPush).toHaveBeenCalledWith({
        message: "a spike",
        includeUntracked: false,
      }),
    );
  });

  it("includes untracked files only when asked", async () => {
    const client = renderPanel();
    const user = await openStash();

    await user.click(
      screen.getByRole("checkbox", { name: /include untracked files/i }),
    );
    await user.click(screen.getByRole("button", { name: /stash changes/i }));

    await waitFor(() =>
      expect(client.git.stashPush).toHaveBeenCalledWith({
        // No message typed is `null`, not an empty string: git writes its own
        // `WIP on <branch>` subject, and an empty `-m` would erase it.
        message: null,
        includeUntracked: true,
      }),
    );
  });

  it("surfaces a conflicting pop and says the entry is still there", async () => {
    const client = renderPanel({
      failures: {
        "git.stashApply": {
          kind: "invalidArgument",
          detail: {
            message:
              "the stash could not be applied cleanly - it conflicts with the working tree. The entry is still on the stack.",
          },
        },
      },
    });
    const user = await openStash();
    await screen.findByText("half a refactor");

    await user.click(
      screen.getAllByRole("button", { name: /apply and remove this entry/i })[0],
    );

    expect(await screen.findByText(/still on the stack/i)).toBeVisible();
    expect(client.git.stashApply).toHaveBeenCalledTimes(1);
  });
});
