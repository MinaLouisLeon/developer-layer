import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GitHubPane } from "@/features/github/components/GitHubPane";

import {
  CLEAN_REPOSITORY,
  createFakeTransport,
  makeIssue,
  READY_PROBE,
} from "../fake-transport";
import { renderConnected } from "../harness";

/**
 * The issue list - #18.
 *
 * Collapsed by default, and the first assertion below is why: the list is only
 * read once the section is opened. An issue list is background reading rather
 * than something checked before a commit, and a call per session for a list
 * nobody looked at is a call spent from the reader's rate limit for nothing.
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

describe("the issue list", () => {
  /** Collapsed by default, so every assertion here opens it first. */
  async function openIssues() {
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Issues/ }));
    return user;
  }

  it("makes no call at all until it is opened", async () => {
    const fake = renderPane({ issues: [makeIssue(7)] });
    // The pull request list has already loaded, so the pane is settled.
    await screen.findByText("No open pull requests.");
    expect(fake.countGitHub("issues")).toBe(0);

    await openIssues();
    await waitFor(() => expect(fake.countGitHub("issues")).toBe(1));
  });

  it("renders open issues with their labels", async () => {
    renderPane({
      issues: [
        makeIssue(7, {
          title: "The tree forgets its expansion",
          labels: ["bug", "file tree"],
        }),
      ],
    });
    await openIssues();

    expect(
      await screen.findByText("The tree forgets its expansion"),
    ).toBeInTheDocument();
    expect(await screen.findByText(/bug, file tree/)).toBeInTheDocument();
  });

  it("reads as a sentence when there are none", async () => {
    renderPane({ issues: [] });
    await openIssues();
    expect(await screen.findByText("No open issues.")).toBeInTheDocument();
  });

  it("renders an issue title containing markup as text", async () => {
    const hostile = "<script>alert(1)</script>";
    renderPane({ issues: [makeIssue(7, { title: hostile })] });
    await openIssues();

    expect(await screen.findByTitle(hostile)).toHaveTextContent(hostile);
    expect(document.querySelector("script")).toBeNull();
  });
});
