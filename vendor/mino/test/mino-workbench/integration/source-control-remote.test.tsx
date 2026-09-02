import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SourceControlPane } from "@/features/source-control/components/SourceControlPane";

import {
  CLEAN_REPOSITORY,
  createFakeTransport,
  makeRemote,
} from "../fake-transport";
import { renderConnected } from "../harness";

/**
 * Fetch and pull - #7.
 *
 * The two that cannot lose anything the reader did not choose to lose. A fetch
 * touches no file; a pull is refused outright over uncommitted work, and
 * reports which of five things it did rather than leaving the reader to
 * compare two lists.
 *
 * Push is next door, in `source-control-push.test.tsx`.
 */
function renderPanel(overrides = {}) {
  const fake = createFakeTransport({
    repository: CLEAN_REPOSITORY,
    remotes: [makeRemote()],
    ...overrides,
  });
  renderConnected(<SourceControlPane />, fake.client);
  return fake;
}

/**
 * Expands the section and waits for its controls to be usable.
 *
 * The wait is not incidental. Fetch, pull and push are disabled until *both*
 * the remotes list and the branch have been read, and the branch comes from a
 * status the workbench deliberately waits a moment before asking for - so a
 * test that clicked as soon as the button existed would be clicking a disabled
 * button on a slow machine, and failing somewhere else entirely.
 */
async function openRemote() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /Remote/ }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Fetch" })).toBeEnabled(),
  );
  return user;
}

describe("the remote controls", () => {
  it("reads nothing until the section is opened", async () => {
    const fake = renderPanel();
    await screen.findByText("Nothing to commit");
    expect(fake.client.git.remotes).not.toHaveBeenCalled();

    await openRemote();
    await waitFor(() => expect(fake.client.git.remotes).toHaveBeenCalled());
  });

  it("fetches without confirming, because it can lose nothing", async () => {
    const fake = renderPanel();
    const user = await openRemote();

    await user.click(await screen.findByRole("button", { name: "Fetch" }));
    await waitFor(() => expect(fake.client.git.fetch).toHaveBeenCalledWith("origin"));
    expect(await screen.findByText("Fetched from origin")).toBeInTheDocument();
  });

  it("says which of the five things a pull did", async () => {
    const fake = renderPanel({ pullOutcome: "fastForwarded" });
    const user = await openRemote();

    await user.click(await screen.findByRole("button", { name: "Pull" }));
    await waitFor(() => expect(fake.pulls).toHaveLength(1));
    expect(
      await screen.findByText("Fast-forwarded from origin"),
    ).toBeInTheDocument();
  });

  it("says so plainly when a pull left the tree conflicted", async () => {
    // A state, not a failure: the merge stopped and the files are where it
    // left them.
    renderPanel({ pullOutcome: "conflicted" });
    const user = await openRemote();

    await user.click(await screen.findByRole("button", { name: "Pull" }));
    expect(
      await screen.findByText(/The merge stopped on a conflict/),
    ).toBeInTheDocument();
  });

  it("refuses a pull over uncommitted work, with the sentence Rust wrote", async () => {
    renderPanel({
      failures: {
        "git.pull": {
          kind: "invalidArgument",
          detail: {
            message:
              "there are uncommitted changes in the working tree, and a pull could overwrite them. Commit or stash them first - the Stash section below will set them aside and give them back afterwards.",
          },
        },
      },
    });
    const user = await openRemote();
    await user.click(await screen.findByRole("button", { name: "Pull" }));

    expect(await screen.findByText(/Stash section below/)).toBeInTheDocument();
  });

  it("says so when there is no remote to talk to", async () => {
    // Expanded directly rather than through `openRemote`: there are no
    // controls to wait for, which is the thing being asserted.
    renderPanel({ remotes: [] });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Remote/ }));

    expect(await screen.findByText(/no remote configured/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fetch" })).toBeNull();
  });
});
