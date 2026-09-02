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
 * The stash section: what it shows, what each control sends, and the one
 * control that asks before acting.
 *
 * The index assertions are the point of several of these. An index is a
 * *position* - dropping one renumbers the rest - so a control that sent the
 * wrong number would apply or delete somebody else's work, and it would look
 * like it had worked.
 */
const STASHES = [
  makeStash(0, { message: "half a refactor", branch: "dev" }),
  makeStash(1, { message: "a spike", branch: "main" }),
];

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

describe("the stash section", () => {
  it("is collapsed by default and reads nothing until it is opened", async () => {
    const client = renderPanel();
    // Waiting on the panel rather than on nothing, so this is a real
    // assertion about the section and not a race that always passes.
    await screen.findByRole("button", { name: /^stash$/i });

    expect(client.git.stashList).not.toHaveBeenCalled();
    expect(screen.queryByText("half a refactor")).toBeNull();
  });

  it("renders each entry with its message and the branch it came from", async () => {
    renderPanel();
    await openStash();

    expect(await screen.findByText("half a refactor")).toBeVisible();
    expect(screen.getByText("a spike")).toBeVisible();
    expect(screen.getByText(/on dev/)).toBeVisible();
  });

  it("applies the entry whose row was clicked, keeping it", async () => {
    const client = renderPanel();
    const user = await openStash();
    await screen.findByText("a spike");

    const rows = screen.getAllByRole("button", {
      name: /apply, keeping this entry/i,
    });
    await user.click(rows[1]);

    // The second row's index, not its position in the array - they agree
    // here, and they are still two different facts.
    await waitFor(() =>
      expect(client.git.stashApply).toHaveBeenCalledWith(1, false),
    );
  });

  it("pops with the same index and the pop flag set", async () => {
    const client = renderPanel();
    const user = await openStash();
    await screen.findByText("half a refactor");

    await user.click(
      screen.getAllByRole("button", { name: /apply and remove this entry/i })[0],
    );

    await waitFor(() =>
      expect(client.git.stashApply).toHaveBeenCalledWith(0, true),
    );
  });

  it("asks before dropping, and names the entry", async () => {
    const client = renderPanel();
    const user = await openStash();
    await screen.findByText("half a refactor");

    await user.click(
      screen.getAllByRole("button", { name: /delete this entry/i })[0],
    );

    const dialog = await screen.findByRole("alertdialog", {
      name: /delete this stash/i,
    });
    expect(dialog).toHaveTextContent("half a refactor");
    // Asking and acting are two functions, and only one of them calls this.
    expect(client.git.stashDrop).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^delete it$/i }));
    await waitFor(() => expect(client.git.stashDrop).toHaveBeenCalledWith(0));
  });
});
