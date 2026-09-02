import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GitHubPane } from "@/features/github/components/GitHubPane";
import { FileTreePane } from "@/features/file-tree/components/FileTreePane";
import { ViewerPane } from "@/features/viewer/components/ViewerPane";

import {
  CLEAN_REPOSITORY,
  createFakeTransport,
  makeEntry,
  makePull,
  makeThread,
  READY_PROBE,
} from "../fake-transport";
import { renderConnected } from "../harness";

/**
 * The review gutter - #17, where a thread meets a line.
 *
 * The pair of assertions here is the whole feature in miniature. A thread
 * GitHub can place gets a marker on its line; a thread whose diff is no longer
 * current gets **none at all**, and is read in the panel instead. Pinning it to
 * a line it might not belong to would put somebody's objection next to code
 * that has nothing to do with it, and a reader would act on it.
 *
 * The panel is next door, in `github-review.test.tsx`.
 */
const FILE = "/root/src/main.rs";

function renderAll(overrides = {}) {
  const fake = createFakeTransport({
    repository: CLEAN_REPOSITORY,
    probe: READY_PROBE,
    pulls: [makePull(7, { title: "A pull request to review" })],
    listings: { "/root": [makeEntry(FILE)] },
    files: {
      [FILE]: {
        path: FILE,
        content: "fn main() {\n    let x = 1;\n}\n",
        encoding: "utf8",
        size: 30,
        modifiedMs: 1,
        extension: "rs",
      },
    },
    ...overrides,
  });
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

/** Starts a review - the only thing that puts threads in the editor. */
async function startReview() {
  const user = userEvent.setup();
  const row = await screen.findByText(/A pull request to review/);
  await user.click(
    within(row.closest("li")!).getByRole("button", { name: "Review" }),
  );
  return user;
}

describe("the review gutter", () => {
  it("draws a marker in the gutter on the line a thread sits on", async () => {
    renderAll({ reviewThreads: [makeThread(111, { line: 2 })] });
    const user = await startReview();
    await user.click(await screen.findByText("main.rs"));

    await waitFor(() =>
      expect(document.querySelector(".cm-review-gutter")).toBeInTheDocument(),
    );
    expect(document.querySelectorAll(".cm-review-marker")).toHaveLength(1);
  });

  it("draws no marker for an outdated thread", async () => {
    // The rule the whole feature turns on, asserted where it shows: a thread
    // GitHub can no longer place is listed in the panel and drawn nowhere.
    renderAll({
      reviewThreads: [makeThread(200, { line: null, outdated: true })],
    });
    const user = await startReview();
    await user.click(await screen.findByText("main.rs"));

    await screen.findByText(/Outdated/);
    expect(document.querySelector(".cm-review-gutter")).not.toBeInTheDocument();
  });
});
