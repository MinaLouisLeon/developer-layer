import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import { WorkbenchHeader } from "@/features/workbench/components/WorkbenchHeader";

import {
  CLEAN_REPOSITORY,
  createFakeTransport,
  makeGitEntry,
} from "../fake-transport";
import { renderConnected } from "../harness";

describe("the header's git strip", () => {
  it("shows the branch name", async () => {
    const { client } = createFakeTransport({ repository: CLEAN_REPOSITORY });
    renderConnected(<WorkbenchHeader />, client);
    expect(await screen.findByText("main")).toBeInTheDocument();
  });

  it("marks a dirty branch and leaves a clean one unmarked", async () => {
    const { client } = createFakeTransport({
      repository: CLEAN_REPOSITORY,
      status: { entries: [makeGitEntry("/root/main.rs")] },
    });
    renderConnected(<WorkbenchHeader />, client);
    expect(
      await screen.findByText("This branch has uncommitted changes"),
    ).toBeInTheDocument();
  });

  it("does not mark a branch dirty for ignored files alone", async () => {
    const { client } = createFakeTransport({
      repository: CLEAN_REPOSITORY,
      status: {
        entries: [
          makeGitEntry("/root/build.log", {
            index: "ignored",
            worktree: "ignored",
          }),
        ],
      },
    });
    renderConnected(<WorkbenchHeader />, client);
    await screen.findByText("main");
    expect(
      screen.queryByText("This branch has uncommitted changes"),
    ).not.toBeInTheDocument();
  });

  it("shows ahead and behind counts, singular and plural", async () => {
    const { client } = createFakeTransport({
      repository: { ...CLEAN_REPOSITORY, ahead: 1, behind: 3 },
    });
    renderConnected(<WorkbenchHeader />, client);
    expect(await screen.findByText("1 commit to push")).toBeInTheDocument();
    expect(screen.getByText("3 commits to pull")).toBeInTheDocument();
  });

  it("names a detached HEAD instead of leaving a gap", async () => {
    const { client } = createFakeTransport({
      repository: {
        ...CLEAN_REPOSITORY,
        branch: null,
        detached: true,
        head: "3f2a1c9",
      },
    });
    renderConnected(<WorkbenchHeader />, client);
    expect(await screen.findByText("detached 3f2a1c9")).toBeInTheDocument();
  });

  it("shows an unborn branch by name, with no head", async () => {
    const { client } = createFakeTransport({
      repository: { ...CLEAN_REPOSITORY, head: null, upstream: null },
    });
    renderConnected(<WorkbenchHeader />, client);
    const branch = await screen.findByText("main");
    expect(branch.closest("span[title]")).toHaveAttribute(
      "title",
      "This branch has no commits yet",
    );
  });

  it("says nothing at all when the folder is not a repository", async () => {
    const { client } = createFakeTransport();
    renderConnected(<WorkbenchHeader />, client);
    await waitFor(() => expect(client.git.repository).toHaveBeenCalled());
    expect(screen.queryByText("main")).not.toBeInTheDocument();
    expect(
      screen.queryByText("git is not available here"),
    ).not.toBeInTheDocument();
  });

  it("says so once when the target has no git surface", async () => {
    const { client } = createFakeTransport({
      failures: {
        "git.repository": {
          kind: "unimplemented",
          detail: { feature: "git_repository", transport: "remoteAgent" },
        },
      },
    });
    renderConnected(<WorkbenchHeader />, client);
    expect(
      await screen.findByText("git is not available here"),
    ).toBeInTheDocument();
  });
});
