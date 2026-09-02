import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import { FileTreePane } from "@/features/file-tree/components/FileTreePane";
import { GitHubPane } from "@/features/github/components/GitHubPane";
import { SourceControlPane } from "@/features/source-control/components/SourceControlPane";

import {
  ABSENT_PROBE,
  CLEAN_REPOSITORY,
  createFakeTransport,
  makeEntry,
  makeGitEntry,
  UNAUTHENTICATED_PROBE,
} from "../fake-transport";
import { renderConnected } from "../harness";

/**
 * The three quiet states, and the promise that goes with them.
 *
 * Two things are asserted. The first is that each silence says something
 * *different*: "install gh", "run `gh auth login`" and "this is not a GitHub
 * repository" are three situations with three different next moves, and a view
 * that answered all of them with "unavailable" would be worse than no view.
 *
 * The second is that **nothing else in the app changes.** A machine without
 * `gh` is an ordinary machine. The tree still decorates itself, source control
 * still works, and no section makes a call it cannot make - which is what the
 * request log is checked for.
 */
describe("when gh is not available", () => {
  it("says which to install, and asks GitHub for nothing", async () => {
    const fake = createFakeTransport({
      repository: CLEAN_REPOSITORY,
      probe: ABSENT_PROBE,
    });
    renderConnected(<GitHubPane />, fake.client);

    expect(
      await screen.findByText("The GitHub CLI is not installed"),
    ).toBeInTheDocument();
    expect(await screen.findByText(/cli\.github\.com/)).toBeInTheDocument();

    // Not one query. A section that asked anyway would fail per call rather
    // than the view saying the one useful thing once.
    await waitFor(() => expect(fake.client.github.probe).toHaveBeenCalled());
    expect(fake.githubRequests).toEqual([]);
  });

  it("names the command when nobody is signed in", async () => {
    const fake = createFakeTransport({
      repository: CLEAN_REPOSITORY,
      probe: UNAUTHENTICATED_PROBE,
    });
    renderConnected(<GitHubPane />, fake.client);

    expect(
      await screen.findByText("Not signed in to GitHub"),
    ).toBeInTheDocument();
    // The app cannot log anybody in - the handshake is interactive and the
    // credential belongs to gh's own keychain entry - so naming the command
    // is the only correct thing to say.
    expect(await screen.findByText(/gh auth login/)).toBeInTheDocument();
    expect(fake.githubRequests).toEqual([]);
  });

  it("treats a remote that is not GitHub as a quiet absence", async () => {
    // The fake's default: not a GitHub repository. A GitLab or Bitbucket
    // remote lands here, and it is not an error.
    const fake = createFakeTransport({ repository: CLEAN_REPOSITORY });
    renderConnected(<GitHubPane />, fake.client);

    expect(
      await screen.findByText("No GitHub repository here"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("alert"),
      "a remote pointing elsewhere is not a failure",
    ).not.toBeInTheDocument();
  });

  it("reports a probe that actually failed as a failure", async () => {
    // Different from all three above, and the only one worth an alert: the
    // probe itself went wrong rather than answering.
    const fake = createFakeTransport({
      repository: CLEAN_REPOSITORY,
      failures: {
        "github.probe": {
          kind: "timeout",
          detail: { operation: "gh auth status", ms: 20_000 },
        },
      },
    });
    renderConnected(<GitHubPane />, fake.client);

    expect(
      await screen.findByText("GitHub could not be reached"),
    ).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("leaves the rest of the workbench exactly as it was", async () => {
    const fake = createFakeTransport({
      probe: ABSENT_PROBE,
      repository: CLEAN_REPOSITORY,
      status: { entries: [makeGitEntry("/root/a.txt")] },
      listings: { "/root": [makeEntry("/root/a.txt")] },
    });
    renderConnected(
      <>
        <FileTreePane />
        <SourceControlPane />
      </>,
      fake.client,
    );

    // The tree still decorates itself from git, and source control still
    // lists what changed. `gh` being missing is a fact about `gh`.
    expect(await screen.findByText("a.txt")).toBeInTheDocument();
    expect(await screen.findByText("Changes")).toBeInTheDocument();
  });
});
