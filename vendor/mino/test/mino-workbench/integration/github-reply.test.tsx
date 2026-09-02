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
 * Replying to a review thread - #17, and the only part of it that writes.
 *
 * A reply and not a new comment, which is the plan's own limit: a top-level
 * review comment has to name a commit and a diff position, and getting either
 * wrong puts an objection against the wrong line for everybody who reads it
 * afterwards. A reply needs only the thread the reader is already looking at.
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

/** Starts a review, which is the only thing that puts threads in the editor. */
async function startReview() {
  const user = userEvent.setup();
  const row = await screen.findByText(/A pull request to review/);
  const item = row.closest("li");
  await user.click(within(item!).getByRole("button", { name: "Review" }));
  return user;
}

describe("replying to a review thread", () => {
  it("sends a reply to the thread it was typed in", async () => {
    const fake = renderAll({
      reviewThreads: [makeThread(111, { path: "src/main.rs", line: 2 })],
    });
    const user = await startReview();
    await user.click(await screen.findByText("main.rs"));

    await user.type(
      await screen.findByLabelText("Reply to this thread"),
      "It's fine by me.",
    );
    await user.click(screen.getByRole("button", { name: "Reply" }));

    await waitFor(() =>
      expect(fake.githubRequests).toContainEqual({
        kind: "replyToReviewComment",
        // The apostrophe survives, because the body is JSON on stdin.
        detail: { number: 7, commentId: 111, body: "It's fine by me." },
      }),
    );
  });
});
