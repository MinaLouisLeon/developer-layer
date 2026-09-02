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
 * Review comments in the editor - #17.
 *
 * The assertion this suite exists for is the outdated one. A review comment is
 * anchored to a position in a *diff*, and when the pull request gains commits
 * that diff stops being current - so the thread has no line. It must be
 * **listed and never placed**: pinning it to a line it might not belong to
 * would put somebody's objection next to code that has nothing to do with it,
 * and a reader would act on it.
 *
 * Replying is next door, in `github-reply.test.tsx`.
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

describe("review comments", () => {
  it("reads nothing until a pull request is picked to review", async () => {
    // Nothing appears in the editor that the reader did not ask for.
    const fake = renderAll({ reviewThreads: [makeThread(111)] });
    await screen.findByText(/A pull request to review/);
    expect(fake.countGitHub("reviewComments")).toBe(0);
    expect(screen.queryByLabelText("Review")).not.toBeInTheDocument();
  });

  it("shows the threads for the open file once a review is started", async () => {
    const fake = renderAll({ reviewThreads: [makeThread(111, { line: 2 })] });
    const user = await startReview();
    await waitFor(() => expect(fake.countGitHub("reviewComments")).toBe(1));

    await user.click(await screen.findByText("main.rs"));
    expect(await screen.findByText("This could be clearer.")).toBeInTheDocument();
    // The author line carries the time beside the name, so this is a match
    // rather than an equality.
    expect(await screen.findByText(/^a-reviewer/)).toBeInTheDocument();
  });

  it("says a thread is outdated, and says what that means", async () => {
    renderAll({
      reviewThreads: [makeThread(200, { line: null, outdated: true })],
    });
    const user = await startReview();
    await user.click(await screen.findByText("main.rs"));

    // Not "resolved" and not "old": the comment stands and only its position
    // is gone. A reader told just "outdated" would dismiss it.
    expect(await screen.findByText(/Outdated/)).toBeInTheDocument();
    expect(
      await screen.findByText(/no longer has a line for it/),
    ).toBeInTheDocument();
    // And still readable, which is the whole point of listing it.
    expect(screen.getByText("This could be clearer.")).toBeInTheDocument();
  });

  it("does not show a thread from another file", async () => {
    renderAll({ reviewThreads: [makeThread(111, { path: "src/other.rs" })] });
    const user = await startReview();
    await user.click(await screen.findByText("main.rs"));

    expect(
      await screen.findByText("No review comments on this file."),
    ).toBeInTheDocument();
  });

  it("renders a comment body containing markup as text", async () => {
    // The same rule every other GitHub row follows: a body is written by
    // whoever left the review, and goes into a text node.
    const hostile = "<img src=x onerror=alert(1)>";
    const thread = makeThread(111, { path: "src/main.rs", line: 2 });
    renderAll({
      reviewThreads: [
        { ...thread, comments: [{ ...thread.comments[0], body: hostile }] },
      ],
    });
    const user = await startReview();
    await user.click(await screen.findByText("main.rs"));

    expect(await screen.findByText(hostile)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("stops showing threads when the review is stopped", async () => {
    renderAll({ reviewThreads: [makeThread(111, { line: 2 })] });
    const user = await startReview();
    await user.click(await screen.findByText("main.rs"));
    await screen.findByText("This could be clearer.");
    // The same control, pressed again.
    const row = screen.getByText(/A pull request to review/).closest("li");
    await user.click(within(row!).getByRole("button", { name: "Review" }));

    await waitFor(() =>
      expect(screen.queryByLabelText("Review")).not.toBeInTheDocument(),
    );
  });
});
