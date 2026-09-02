import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ViewerPane } from "@/features/viewer/components/ViewerPane";
import { FileTreePane } from "@/features/file-tree/components/FileTreePane";

import {
  CLEAN_REPOSITORY,
  createFakeTransport,
  makeEntry,
  READY_PROBE,
} from "../fake-transport";
import { renderConnected } from "../harness";

/**
 * #19 - this file, on github.com.
 *
 * What is worth asserting here is what does **not** happen. The URL comes from
 * `gh`, which is to say from outside; a webview that navigated itself to one
 * would be a webview somebody else can steer. So the address goes to the
 * desktop opener instead - which is why the opener is mocked here rather than
 * the click merely being observed.
 */
const openUrl = vi.fn<(url: string) => Promise<void>>(async () => undefined);
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: (url: string) => openUrl(url),
}));

const FILE = "/root/src/main.rs";

function renderViewer(overrides = {}) {
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
    ...overrides,
  });
  renderConnected(
    <>
      <FileTreePane />
      <ViewerPane />
    </>,
    fake.client,
  );
  return fake;
}

/** Selects the file, which is what puts the command in the viewer header. */
async function openFile() {
  const user = userEvent.setup();
  await user.click(await screen.findByText("main.rs"));
  return user;
}

describe("opening a file on github.com", () => {
  beforeEach(() => openUrl.mockClear());

  it("is not offered until a file is open", async () => {
    renderViewer();
    // The header has no file, so the command does not apply - and a control
    // that is present but dead is one the reader keeps trying.
    expect(
      screen.queryByRole("button", { name: "GitHub" }),
    ).not.toBeInTheDocument();
  });

  it("asks gh for the address, then hands it to the browser", async () => {
    const fake = renderViewer();
    const user = await openFile();

    await user.click(await screen.findByRole("button", { name: "GitHub" }));

    await waitFor(() =>
      expect(fake.githubRequests).toContainEqual({
        kind: "browseUrl",
        // Line 1, because that is where an unedited editor's cursor is. The
        // branch is the one checked out, not the repository's default: a link
        // to a line on a branch without your change is a link to the wrong
        // line.
        detail: { path: FILE, line: 1, branch: "main" },
      }),
    );

    // The window did not navigate. The operating system's browser was asked.
    await waitFor(() => expect(openUrl).toHaveBeenCalledTimes(1));
    // Exactly the URL gh answered with, unchanged. Nothing here builds an
    // address: the app has no idea how github.com lays out its paths, and
    // guessing would be a second implementation of somebody else's routing.
    expect(openUrl).toHaveBeenCalledWith(
      `https://github.com/o/r/blob/main/${FILE}#L1`,
    );
  });

  it("is not offered when the folder has no GitHub repository", async () => {
    renderViewer({ probe: undefined }); // The fake's default: `unsupported`.
    await openFile();
    await screen.findByRole("button", { name: /File/ });
    expect(
      screen.queryByRole("button", { name: "GitHub" }),
    ).not.toBeInTheDocument();
  });

  it("refuses a URL that is not a github.com address", async () => {
    const fake = renderViewer({ browseUrl: "https://example.invalid/steal" });
    const user = await openFile();
    await user.click(await screen.findByRole("button", { name: "GitHub" }));

    // Nothing was opened. `openExternal` checks the origin, and the runtime
    // capability is scoped to github.com so the check holds even if it were
    // wrong here.
    await waitFor(() => expect(fake.countGitHub("browseUrl")).toBe(1));
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("says so when gh cannot place the file", async () => {
    renderViewer({
      failures: {
        "github.browseUrl": {
          kind: "invalidArgument",
          detail: {
            message:
              "GitHub could not place `src/main.rs`. A file that has never been pushed has no address on the web yet.",
          },
        },
      },
    });
    const user = await openFile();
    await user.click(await screen.findByRole("button", { name: "GitHub" }));

    // The sentence lands on the command itself rather than as a banner: it is
    // about this one action, and the viewer's banners are about the file.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "GitHub" }),
      ).toHaveAccessibleDescription(/has never been pushed/),
    );
    expect(openUrl).not.toHaveBeenCalled();
  });
});
