import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GitHubPane } from "@/features/github/components/GitHubPane";

import {
  CLEAN_REPOSITORY,
  createFakeTransport,
  READY_PROBE,
} from "../fake-transport";
import { renderConnected } from "../harness";

/**
 * Creating a pull request - #16, and the one thing in this view that writes.
 *
 * A pull request is **public the moment it lands** and cannot be taken back by
 * this app. So the two assertions that matter most are that submitting the
 * form creates *nothing* on its own, and that the confirmation shows what will
 * be made rather than merely that something will.
 */
function renderPane(overrides = {}) {
  const fake = createFakeTransport({
    repository: CLEAN_REPOSITORY,
    probe: READY_PROBE,
    ...overrides,
  });
  renderConnected(<GitHubPane />, fake.client);
  return fake;
}

/** Opens the section, which is collapsed by default, and fills the title in. */
async function fillIn(title: string) {
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: /New pull request/ }),
  );
  await user.type(await screen.findByLabelText("Title"), title);
  return user;
}

describe("creating a pull request", () => {
  it("asks before it creates, and shows exactly what will be made", async () => {
    const fake = renderPane();
    const user = await fillIn("Bring the checks in");

    await user.click(screen.getByRole("button", { name: "Create pull request" }));

    // Nothing has been sent. The submit button asks.
    expect(fake.countGitHub("createPullRequest")).toBe(0);

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Create this pull request?");
    // What will be made: the title, the branch pair, and the draft state.
    expect(dialog).toHaveTextContent("Bring the checks in");
    // Developer Layer patch: `waitFor`, not a bare `expect`. See
    // vendor/mino/VENDOR.md, "Patches". The dialog opens before the checked-out
    // branch has arrived and renders "this branch" until it does, so this
    // assertion is a race that upstream's pinned dependency tree happened to
    // win. The behaviour is right either way — the pair does appear — and
    // waiting is what the assertions around it already do.
    await waitFor(() => expect(dialog).toHaveTextContent("main → main"));
    expect(dialog).toHaveTextContent("Ready for review");
  });

  it("creates nothing when the confirmation is cancelled", async () => {
    const fake = renderPane();
    const user = await fillIn("Never mind");
    await user.click(screen.getByRole("button", { name: "Create pull request" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(fake.countGitHub("createPullRequest")).toBe(0);
    // And the form still holds what was typed.
    expect(screen.getByLabelText("Title")).toHaveValue("Never mind");
  });

  it("sends what was typed, and shows the URL it made", async () => {
    const fake = renderPane({
      createdPullRequest: {
        url: "https://github.com/o/r/pull/42",
        number: 42,
      },
    });
    const user = await fillIn("Bring the checks in");
    await user.type(await screen.findByLabelText("Description"), "It's overdue.");
    await user.click(screen.getByLabelText("Open as a draft"));

    await user.click(screen.getByRole("button", { name: "Create pull request" }));
    await user.click(await screen.findByRole("button", { name: "Create it" }));

    // `toContainEqual` rather than "the last request", because a successful
    // create is followed by a re-read: the list below now has a row it did not
    // have a moment ago.
    await waitFor(() =>
      expect(fake.githubRequests).toContainEqual({
        kind: "createPullRequest",
        detail: {
          title: "Bring the checks in",
          // The apostrophe survives, because the body travels on stdin.
          body: "It's overdue.",
          base: "main",
          draft: true,
        },
      }),
    );
    expect(fake.countGitHub("pullRequests")).toBeGreaterThan(1);

    // A pull request whose address the author has to go and find is one the
    // app only half opened.
    expect(await screen.findByText("Pull request created")).toBeInTheDocument();
    expect(
      await screen.findByTitle("Open it on github.com"),
    ).toBeInTheDocument();
  });

  it("seeds the base, and cannot be submitted with no title at all", async () => {
    renderPane();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: /New pull request/ }),
    );
    // The repository's own default branch, so the common case needs no typing.
    expect(await screen.findByLabelText("Base branch")).toHaveValue("main");
    expect(
      screen.getByRole("button", { name: "Create pull request" }),
    ).toBeDisabled();
  });

  it("keeps what was typed when the call is refused", async () => {
    renderPane({
      failures: {
        "github.createPullRequest": {
          kind: "shell",
          detail: {
            message: "must be on a branch named differently than \"main\"",
          },
        },
      },
    });
    const user = await fillIn("On the wrong branch");
    await user.click(screen.getByRole("button", { name: "Create pull request" }));
    await user.click(await screen.findByRole("button", { name: "Create it" }));

    expect(
      await screen.findByText(/must be on a branch named differently/),
    ).toBeInTheDocument();
    // Nothing was cleared: there is something to fix and then try again.
    expect(screen.getByLabelText("Title")).toHaveValue("On the wrong branch");
  });
});
