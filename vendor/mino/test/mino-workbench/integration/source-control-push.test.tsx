import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SourceControlPane } from "@/features/source-control/components/SourceControlPane";

import {
  CLEAN_REPOSITORY,
  createFakeTransport,
  makeRemote,
} from "../fake-transport";
import { renderConnected } from "../harness";

/**
 * Push - #7, and the half with something to lose.
 *
 * Every assertion here is about **what does not happen**. A push that was not
 * confirmed must not reach the transport; a force push must not be reachable
 * through the ordinary confirmation; and a rejected push must not offer
 * forcing as the way out - because the moment somebody has been told the
 * remote has commits they do not have is the worst possible moment to offer to
 * delete those commits.
 *
 * The fake records every push it was handed, which is how "nothing was sent"
 * is asserted rather than assumed.
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
 * The wait is not incidental: the controls are disabled until both the remotes
 * list and the branch have been read. See the same helper in
 * `source-control-remote.test.tsx`.
 */
async function openRemote() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /Remote/ }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Fetch" })).toBeEnabled(),
  );
  return user;
}

/**
 * The confirm button *inside the dialog*.
 *
 * Scoped rather than looked up globally, because the dialog's button and the
 * section's button deliberately carry the same word: "Push" is what the reader
 * is doing in both places, and renaming one of them to make a query easier
 * would be the test shaping the interface.
 */
async function confirmIn(name: RegExp | string) {
  const dialog = await screen.findByRole("alertdialog");
  return within(dialog).getByRole("button", { name });
}

describe("pushing", () => {
  it("asks before pushing, naming the remote and the branch", async () => {
    const fake = renderPanel();
    const user = await openRemote();

    await user.click(await screen.findByRole("button", { name: "Push" }));

    // Nothing has been sent. The button asks.
    expect(fake.pushes).toEqual([]);
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Push this branch?");
    expect(dialog).toHaveTextContent("main will be sent to origin");
  });

  it("sends nothing when the confirmation is cancelled", async () => {
    const fake = renderPanel();
    const user = await openRemote();
    await user.click(await screen.findByRole("button", { name: "Push" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(fake.pushes).toEqual([]);
  });

  it("pushes what was confirmed, and never forces from that path", async () => {
    const fake = renderPanel();
    const user = await openRemote();
    await user.click(await screen.findByRole("button", { name: "Push" }));
    await user.click(await confirmIn("Push"));

    await waitFor(() => expect(fake.pushes).toHaveLength(1));
    expect(fake.pushes[0]).toEqual({
      remote: "origin",
      branch: "main",
      // The whole point of two ask functions rather than one with a flag.
      force: false,
      setUpstream: true,
    });
    expect(await screen.findByText("Pushed main to origin")).toBeInTheDocument();
  });

  it("confirms a force push separately, and says what it can destroy", async () => {
    const fake = renderPanel();
    const user = await openRemote();

    await user.click(await screen.findByRole("button", { name: "Force push" }));
    expect(fake.pushes).toEqual([]);

    const dialog = await screen.findByRole("alertdialog");
    // Not "are you sure?" - what will be gone, and whose it might be.
    expect(dialog).toHaveTextContent(/will be replaced by this branch/);
    expect(dialog).toHaveTextContent(/including anyone else's/);
    // And what still protects them, because a reader who knows can act.
    expect(dialog).toHaveTextContent(/Git will still refuse/);

    await user.click(await confirmIn("Force push"));
    await waitFor(() => expect(fake.pushes).toHaveLength(1));
    expect(fake.pushes[0].force).toBe(true);
  });

  it("surfaces a rejected push and does not offer to force it", async () => {
    const fake = renderPanel({
      failures: {
        "git.push": {
          kind: "invalidArgument",
          detail: {
            message:
              "the remote has commits this branch does not. Fetch and pull first, then push again. Nothing was pushed.",
          },
        },
      },
    });
    const user = await openRemote();
    await user.click(await screen.findByRole("button", { name: "Push" }));
    await user.click(await confirmIn("Push"));

    expect(await screen.findByText(/Fetch and pull first/)).toBeInTheDocument();
    // The force control is exactly where it always was - not offered as a
    // recovery, and not moved next to the error.
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(fake.pushes).toHaveLength(1);
  });
});
