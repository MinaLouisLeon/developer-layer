import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GitHubPane } from "@/features/github/components/GitHubPane";

import {
  CLEAN_REPOSITORY,
  createFakeTransport,
  makeJob,
  makeRun,
  READY_PROBE,
} from "../fake-transport";
import { renderConnected } from "../harness";

/**
 * The checks section - #14, and the one that earns its place daily.
 *
 * Three things are asserted, and only the first is about rendering. The second
 * is that a red build **names the job that broke**, which is the difference
 * between a notification and something worth acting on. The third is that the
 * second call is made *only* for a red build: a green one has no job worth
 * naming, and asking anyway would double the cost of the common case.
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

describe("the checks section", () => {
  it("shows a passing run, open, without being asked to", async () => {
    // Open by default, and the only section that is: whether the branch is
    // green is the first thing worth knowing when you look at one.
    renderPane({ runs: [makeRun({ state: "passed" })] });

    expect(
      await screen.findByText("feat(github): the checks section"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Passed")).toBeInTheDocument();
  });

  it("shows a run that is still going", async () => {
    renderPane({ runs: [makeRun({ state: "running", startedMs: null })] });
    expect(await screen.findByText("Running")).toBeInTheDocument();
  });

  it("names the failing job when a run went red", async () => {
    const fake = renderPane({
      runs: [makeRun({ state: "failed" })],
      jobs: [
        makeJob({ name: "build", state: "passed" }),
        makeJob({ name: "test (windows)", state: "failed" }),
      ],
    });

    expect(await screen.findByText("Failed")).toBeInTheDocument();
    expect(await screen.findByText("Failing jobs")).toBeInTheDocument();
    expect(await screen.findByText("test (windows)")).toBeInTheDocument();
    // Only the failing ones. A list of every job would bury the answer.
    expect(screen.queryByText("build")).not.toBeInTheDocument();
    await waitFor(() => expect(fake.countGitHub("runJobs")).toBe(1));
  });

  it("does not ask for jobs when the run passed", async () => {
    const fake = renderPane({ runs: [makeRun({ state: "passed" })] });
    await screen.findByText("Passed");
    expect(fake.countGitHub("runJobs")).toBe(0);
  });

  it("reads a sentence when there is no run for this branch", async () => {
    renderPane({ runs: [] });
    expect(
      await screen.findByText("No workflow run for this branch yet."),
    ).toBeInTheDocument();
  });

  it("stops asking when the section is closed", async () => {
    const user = userEvent.setup();
    const fake = renderPane({ runs: [makeRun()] });
    await screen.findByText("Passed");
    const asked = fake.countGitHub("runs");

    await user.click(screen.getByRole("button", { name: /Checks/ }));
    await waitFor(() =>
      expect(screen.queryByText("Passed")).not.toBeInTheDocument(),
    );
    // A closed section makes no call, which is the second half of the "no
    // timer" policy: nothing is polled, and nothing nobody is looking at is
    // fetched at all.
    expect(fake.countGitHub("runs")).toBe(asked);
  });

  it("says so plainly when there is no branch to ask about", async () => {
    // A detached HEAD, or a repository with no commits yet. There is nothing
    // for `gh run list --branch` to be given.
    renderPane({ repository: { ...CLEAN_REPOSITORY, branch: null } });
    expect(
      await screen.findByText(
        "There is no branch checked out, so there is no run to look at.",
      ),
    ).toBeInTheDocument();
  });

  it("surfaces a failed call as a sentence rather than an empty section", async () => {
    renderPane({
      runs: [makeRun()],
      failures: {
        "github.runs": {
          kind: "timeout",
          detail: { operation: "gh run list", ms: 20_000 },
        },
      },
    });
    expect(
      await screen.findByText(/gh run list took longer than 20s/),
    ).toBeInTheDocument();
  });
});
