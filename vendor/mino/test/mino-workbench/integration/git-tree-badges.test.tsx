import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import type { GitFileState } from "@/Types";
import { FileTreePane } from "@/features/file-tree/components/FileTreePane";

import {
  CLEAN_REPOSITORY,
  createFakeTransport,
  makeEntry,
  makeGitEntry,
} from "../fake-transport";
import { renderConnected } from "../harness";

const LISTING = {
  "/root": [
    makeEntry("/root/main.rs"),
    makeEntry("/root/added.rs"),
    makeEntry("/root/gone.rs"),
    makeEntry("/root/notes.txt"),
    makeEntry("/root/build.log"),
  ],
};

function renderTree(
  entries: ReturnType<typeof makeGitEntry>[],
  repository = CLEAN_REPOSITORY,
) {
  const { client } = createFakeTransport({
    listings: LISTING,
    repository,
    status: { entries },
  });
  renderConnected(<FileTreePane />, client);
  return client;
}

describe("git-aware file tree", () => {
  it("renders a badge for each state, from the side that has something to say", async () => {
    renderTree([
      makeGitEntry("/root/main.rs", { worktree: "modified" }),
      // Staged and then left alone: the badge comes from the index side,
      // because the work tree has nothing to report.
      makeGitEntry("/root/added.rs", {
        index: "added",
        worktree: "unmodified",
      }),
      makeGitEntry("/root/gone.rs", { worktree: "deleted" }),
      makeGitEntry("/root/notes.txt", {
        index: "untracked",
        worktree: "untracked",
      }),
    ]);

    expect(await screen.findByTitle("Modified")).toHaveTextContent("M");
    expect(screen.getByTitle("Added")).toHaveTextContent("A");
    expect(screen.getByTitle("Deleted")).toHaveTextContent("D");
    expect(screen.getByTitle("Untracked")).toHaveTextContent("U");
  });

  it("shows the unstaged side when a file is staged and then modified again", async () => {
    renderTree([
      makeGitEntry("/root/main.rs", { index: "added", worktree: "modified" }),
    ]);
    // The change being made right now is what the row is about.
    expect(await screen.findByTitle("Modified")).toHaveTextContent("M");
    expect(screen.queryByTitle("Added")).not.toBeInTheDocument();
  });

  it("dims an ignored row and gives it no badge", async () => {
    renderTree([
      makeGitEntry("/root/build.log", {
        index: "ignored",
        worktree: "ignored",
      }),
      makeGitEntry("/root/main.rs", { worktree: "modified" }),
    ]);

    // Waiting on the badge is waiting on the status having landed.
    await screen.findByTitle("Modified");
    expect(screen.getByText("build.log")).toHaveClass("text-textFaint");
    expect(screen.getByText("main.rs")).toHaveClass("text-text");
    expect(screen.queryByTitle("Ignored by git")).not.toBeInTheDocument();
  });

  it("renders a conflicted row with its own marker", async () => {
    const conflicted: GitFileState = "conflicted";
    renderTree([
      makeGitEntry("/root/main.rs", {
        index: conflicted,
        worktree: conflicted,
      }),
    ]);
    expect(await screen.findByTitle("Conflicted")).toHaveTextContent("!");
  });

  it("renders exactly as it does today when the folder is not a repository", async () => {
    const { client } = createFakeTransport({ listings: LISTING });
    renderConnected(<FileTreePane />, client);

    expect(await screen.findByText("main.rs")).toBeInTheDocument();
    await waitFor(() => expect(client.git.repository).toHaveBeenCalled());
    // No badge, no error, and no second call: a folder that is not a checkout
    // costs one cheap question and nothing else.
    expect(client.git.status).not.toHaveBeenCalled();
    expect(screen.queryByTitle("Modified")).not.toBeInTheDocument();
    expect(screen.getByText("main.rs")).toHaveClass("text-text");
  });

  it("leaves the tree alone when git itself is missing", async () => {
    const { client } = createFakeTransport({
      listings: LISTING,
      failures: {
        "git.repository": {
          kind: "shell",
          detail: { message: "git is not installed" },
        },
      },
    });
    renderConnected(<FileTreePane />, client);

    expect(await screen.findByText("main.rs")).toBeInTheDocument();
    await waitFor(() => expect(client.git.repository).toHaveBeenCalled());
    expect(screen.queryByTitle("Modified")).not.toBeInTheDocument();
  });
});
