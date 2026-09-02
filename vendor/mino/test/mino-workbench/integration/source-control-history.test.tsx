import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { GitCommit, GitCommitDetail } from "@/Types";
import { SourceControlPane } from "@/features/source-control/components/SourceControlPane";
import { ViewerPane } from "@/features/viewer/components/ViewerPane";

import { CLEAN_REPOSITORY, createFakeTransport } from "../fake-transport";
import { renderConnected } from "../harness";

/** Fixed in time, so no assertion depends on when the suite runs. */
function commit(sha: string, summary: string): GitCommit {
  return {
    sha: sha.padEnd(40, "0"),
    shortSha: sha,
    summary,
    author: "A Author",
    timestampMs: 1_700_000_000_000,
  };
}

const DETAIL: GitCommitDetail = {
  commit: commit("3f2a1c9", "the newest change"),
  files: [
    { relativePath: "src/main.rs", oldPath: null, state: "modified" },
    { relativePath: "docs/new.md", oldPath: null, state: "added" },
  ],
};

function renderPanel(overrides: Parameters<typeof createFakeTransport>[0] = {}) {
  const { client } = createFakeTransport({
    repository: CLEAN_REPOSITORY,
    log: {
      commits: [
        commit("3f2a1c9", "the newest change"),
        commit("9b8c7d6", "an older change"),
      ],
      truncated: false,
    },
    detail: DETAIL,
    ...overrides,
  });
  renderConnected(<SourceControlPane />, client);
  return client;
}

describe("the history list", () => {
  it("lists commits with their author, time and short sha", async () => {
    renderPanel();

    expect(await screen.findByText("the newest change")).toBeInTheDocument();
    expect(screen.getByText("an older change")).toBeInTheDocument();
    expect(screen.getAllByText("A Author")).not.toHaveLength(0);
    expect(screen.getByText("3f2a1c9")).toBeInTheDocument();
  });

  it("shows the files a commit touched when it is expanded", async () => {
    const client = renderPanel();
    const user = userEvent.setup();
    await user.click(await screen.findByText("the newest change"));

    expect(await screen.findByText("src/main.rs")).toBeInTheDocument();
    expect(screen.getByText("docs/new.md")).toBeInTheDocument();
    await waitFor(() =>
      expect(client.git.show).toHaveBeenCalledWith("3f2a1c9".padEnd(40, "0")),
    );
  });

  it("opens a commit's file as that commit's diff, not the working tree's", async () => {
    // The difference matters: the working tree has nothing to say about a
    // commit from last week. The viewer is rendered too, because the panel
    // sets the mode and the viewer is what reads it - asserting on the panel
    // alone would prove only that a handler ran.
    const { client } = createFakeTransport({
      repository: CLEAN_REPOSITORY,
      log: { commits: [commit("3f2a1c9", "the newest change")], truncated: false },
      detail: DETAIL,
    });
    renderConnected(
      <>
        <SourceControlPane />
        <ViewerPane />
      </>,
      client,
    );
    const user = userEvent.setup();

    await user.click(await screen.findByText("the newest change"));
    await user.click(await screen.findByText("src/main.rs"));

    await waitFor(() =>
      expect(client.git.commitDiff).toHaveBeenCalledWith(
        "3f2a1c9".padEnd(40, "0"),
        // The absolute path, rebuilt from the repository root git reported.
        "/root/src/main.rs",
      ),
    );
    expect(client.git.diff).not.toHaveBeenCalled();
  });

  it("closes an expanded commit when it is chosen again", async () => {
    renderPanel();
    const user = userEvent.setup();
    const row = await screen.findByText("the newest change");
    await user.click(row);
    await screen.findByText("src/main.rs");

    await user.click(row);
    await waitFor(() =>
      expect(screen.queryByText("src/main.rs")).not.toBeInTheDocument(),
    );
  });

  it("offers another page when git said there is one", async () => {
    // The transport bounds every walk, so the list pages rather than
    // pretending it has the whole history.
    renderPanel({
      log: { commits: [commit("3f2a1c9", "only one")], truncated: true },
    });
    expect(
      await screen.findByRole("button", { name: "Show more" }),
    ).toBeInTheDocument();
  });

  it("hides the pager when the page was the whole history", async () => {
    renderPanel();
    await screen.findByText("an older change");
    expect(
      screen.queryByRole("button", { name: "Show more" }),
    ).not.toBeInTheDocument();
  });

  it("says so plainly when there are no commits yet", async () => {
    // An unborn branch. The transport answers with an empty page rather than
    // an error, and the list renders that quietly.
    renderPanel({ log: { commits: [], truncated: false } });
    expect(await screen.findByText("No commits yet.")).toBeInTheDocument();
  });

  it("does not read history outside a repository", async () => {
    const { client } = createFakeTransport();
    renderConnected(<SourceControlPane />, client);

    await screen.findByText("Not a repository");
    await waitFor(() => expect(client.git.repository).toHaveBeenCalled());
    expect(client.git.log).not.toHaveBeenCalled();
  });
});
