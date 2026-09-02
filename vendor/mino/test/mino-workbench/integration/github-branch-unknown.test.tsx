import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { GitRepository } from "@/Types";
import { GitHubPane } from "@/features/github/components/GitHubPane";
import { FileTreePane } from "@/features/file-tree/components/FileTreePane";
import { ViewerPane } from "@/features/viewer/components/ViewerPane";

import {
  CLEAN_REPOSITORY,
  createFakeTransport,
  makeEntry,
  READY_PROBE,
} from "../fake-transport";
import { renderConnected } from "../harness";

/**
 * The window before git has answered.
 *
 * `branch` is `null` in two entirely different situations - there is no branch
 * (a detached HEAD), and the status has not been read yet - and `useGitStatus`
 * deliberately waits a moment before it asks, so the second one happens on
 * *every* session. Reading them as one produced two wrong things:
 *
 * - a link to the file on github.com naming the repository's **default**
 *   branch while the reader was on another one, which looks right and is not;
 * - the checks section stating "there is no branch checked out" about a branch
 *   that had simply not been read.
 *
 * The window is short, which is exactly why it needs a test that does not
 * depend on timing. Git's answer is held here rather than raced: `repository()`
 * returns a promise that never settles, so `availability` stays `loading` and
 * the assertions below are about a state rather than about a moment.
 */
const FILE = "/root/src/main.rs";

function renderHeld() {
  const fake = createFakeTransport({
    repository: CLEAN_REPOSITORY,
    probe: READY_PROBE,
    listings: { "/root": [makeEntry(FILE)] },
    files: {
      [FILE]: {
        path: FILE,
        content: "fn main() {}\n",
        encoding: "utf8",
        size: 13,
        modifiedMs: 1,
        extension: "rs",
      },
    },
  });
  // Held, not slow. The GitHub probe still answers, so everything that does
  // not depend on the branch carries on - which is the point: this is about
  // one fact being unknown, not about the session being unready.
  fake.client.git.repository = vi.fn(
    () => new Promise<GitRepository | null>(() => {}),
  );

  renderConnected(
    <>
      <GitHubPane />
      <FileTreePane />
      <ViewerPane />
    </>,
    fake.client,
  );
  return fake;
}

describe("before git has said which branch is checked out", () => {
  it("does not offer to open the file on github.com", async () => {
    const fake = renderHeld();
    const user = userEvent.setup();
    await user.click(await screen.findByText("main.rs"));

    // The viewer is up and the file is open - the editor's own controls are
    // there - so this is the GitHub command specifically holding back.
    expect(
      await screen.findByRole("button", { name: /File/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "GitHub" }),
    ).not.toBeInTheDocument();

    // And nothing was asked for. A `browseUrl` built here would name the
    // default branch and the reader would have no way to tell.
    expect(fake.countGitHub("browseUrl")).toBe(0);
  });

  it("does not claim there is no branch checked out", async () => {
    const fake = renderHeld();

    // The checks section is open by default, so it renders immediately.
    await waitFor(() =>
      expect(screen.getByLabelText("Checks")).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/no branch checked out/),
    ).not.toBeInTheDocument();

    // It says it is still reading, which is the true statement.
    expect(
      await screen.findByText("Reading the latest run…"),
    ).toBeInTheDocument();
    // And it asked for no runs: a run list for a branch nobody has read would
    // be an answer about the wrong branch.
    expect(fake.countGitHub("runs")).toBe(0);
  });
});
