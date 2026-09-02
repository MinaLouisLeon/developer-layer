import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GitHubPane } from "@/features/github/components/GitHubPane";

import {
  CLEAN_REPOSITORY,
  createFakeTransport,
  makePull,
  READY_PROBE,
} from "../fake-transport";
import { renderConnected } from "../harness";

/**
 * The pull request list - #15.
 *
 * The markup test is the one that matters most here. Every title on this
 * surface was written by whoever opened the thing, which on a public
 * repository is anybody at all. Rust carries it as text; this is the other
 * half of that promise, and it asserts the exact characters reach the page
 * rather than being interpreted.
 *
 * The issue list is next door, in `github-issues.test.tsx`.
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

describe("the pull request list", () => {
  it("renders open pull requests with author, base and check state", async () => {
    renderPane({
      pulls: [
        makePull(15, { title: "feat(git): branches and stash" }),
        makePull(16, { title: "A draft", isDraft: true, checks: "failed" }),
      ],
    });

    expect(
      await screen.findByText("feat(git): branches and stash"),
    ).toBeInTheDocument();
    // Both rows say who opened them and what they merge into, so this is a
    // count rather than a lookup.
    expect(
      await screen.findAllByText(/by MinaLouisLeon · into main/),
    ).toHaveLength(2);
    // And only one of them is a draft.
    expect(await screen.findByText(/^Draft · /)).toBeInTheDocument();
  });

  it("reads as a sentence when there are none", async () => {
    renderPane({ pulls: [] });
    expect(
      await screen.findByText("No open pull requests."),
    ).toBeInTheDocument();
  });

  it("reads the description only for the row that was opened", async () => {
    const user = userEvent.setup();
    const fake = renderPane({
      pulls: [
        makePull(15, { title: "The first" }),
        makePull(16, { title: "The second", body: "Why this exists." }),
      ],
    });

    await screen.findByText("The second");
    // A list carries no bodies: they are the largest field on a pull request
    // and paying for twenty to show twenty titles is a cost nobody sees until
    // it is a rate limit.
    expect(fake.countGitHub("pullRequest")).toBe(0);

    await user.click(screen.getByRole("button", { name: /The second/ }));
    expect(await screen.findByText("Why this exists.")).toBeInTheDocument();
    await waitFor(() => expect(fake.countGitHub("pullRequest")).toBe(1));
    // `toContainEqual` rather than "the last request": the four sections read
    // independently, so which of them answered most recently is not a fact
    // this test is about.
    expect(fake.githubRequests).toContainEqual({
      kind: "pullRequest",
      detail: { number: 16 },
    });
  });

  it("says so when a pull request has no description", async () => {
    const user = userEvent.setup();
    renderPane({ pulls: [makePull(15, { title: "Bare", body: null })] });
    await user.click(await screen.findByRole("button", { name: /Bare/ }));
    expect(
      await screen.findByText("This pull request has no description."),
    ).toBeInTheDocument();
  });

  it("renders a title containing markup as text", async () => {
    const hostile = '<img src=x onerror="alert(1)"> & <b>bold</b>';
    renderPane({ pulls: [makePull(15, { title: hostile })] });

    // The exact characters, in a text node. Nothing was parsed, and no <img>
    // or <b> element exists anywhere on the page.
    const row = await screen.findByTitle(hostile);
    expect(row).toHaveTextContent(hostile);
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("b")).toBeNull();
  });
});
