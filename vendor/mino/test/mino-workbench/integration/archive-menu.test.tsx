// Developer Layer's own tests, alongside upstream's. They cover the archive
// menu patched into the file tree — see vendor/mino/VENDOR.md, "Patches".
//
// Everything below the `invoke` boundary is tested in Rust, in `dl-archive`:
// which switches a plan carries, which exit code means what, where the archive
// lands. What is left for here is the part only the browser can get wrong —
// what the menu offers, and what the user is told afterwards.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FileTreePane } from "@/features/file-tree/components/FileTreePane";

import { createFakeTransport, makeEntry } from "../fake-transport";
import { renderConnected } from "../harness";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const LISTINGS = {
  "/root": [makeEntry("/root/notes.rar"), makeEntry("/root/readme.md")],
};

/** The host's answers, overridable per test. */
function hostReplies(overrides: Record<string, unknown> = {}) {
  const answers: Record<string, unknown> = {
    archive_available: true,
    archive_supported: true,
    ...overrides,
  };
  invoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
    if (command === "archive_supported") {
      const supported = answers.archive_supported;
      return Promise.resolve(
        typeof supported === "function"
          ? (supported as (path: unknown) => boolean)(args?.path)
          : supported,
      );
    }
    const answer = answers[command];
    if (answer instanceof Error) return Promise.reject(answer.message);
    if (answer === undefined) return Promise.reject(`unexpected command ${command}`);
    return Promise.resolve(answer);
  });
}

/** A fake's method as the mock it is - the interface type erases that. */
function calls(fn: unknown): number {
  return (fn as ReturnType<typeof vi.fn>).mock.calls.length;
}

async function openMenuOn(name: RegExp) {
  const user = userEvent.setup();
  const row = await screen.findByRole("treeitem", { name });
  // `fireEvent`, not `user.pointer`: user-event routes a right press through
  // the pointer events, and jsdom does not synthesise `contextmenu` from them.
  fireEvent.contextMenu(row, { clientX: 40, clientY: 40 });
  return { user, menu: await screen.findByRole("menu", { name: "Archive actions" }) };
}

describe("the file tree's archive menu", () => {
  // A block body on purpose: `mockReset` returns the mock for chaining, and an
  // arrow that returns it hands vitest that mock as an afterEach cleanup hook,
  // which then calls `invoke()` with no arguments between every test.
  beforeEach(() => {
    invoke.mockReset();
  });

  it("offers extraction only for a file the host can actually open", async () => {
    // Which extensions those are is Rust's to know: a second list here would
    // be a second list to get wrong.
    hostReplies({
      archive_supported: (path: unknown) => String(path).endsWith(".rar"),
    });
    const { client } = createFakeTransport({ listings: LISTINGS });
    renderConnected(<FileTreePane />, client);

    const { user } = await openMenuOn(/notes\.rar/);
    expect(await screen.findByRole("menuitem", { name: "Extract here" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await openMenuOn(/readme\.md/);
    await waitFor(() =>
      expect(screen.getByRole("menu", { name: "Archive actions" })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("menuitem", { name: "Extract here" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Compress "readme\.md" to \.rar/ }),
    ).toBeInTheDocument();
  });

  it("extracts the row it was opened on", async () => {
    hostReplies({ archive_extract: { path: "/root/notes", warnings: false } });
    const { client } = createFakeTransport({ listings: LISTINGS });
    renderConnected(<FileTreePane />, client);

    const { user } = await openMenuOn(/notes\.rar/);
    await user.click(await screen.findByRole("menuitem", { name: "Extract here" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("archive_extract", {
        path: "/root/notes.rar",
        overwrite: undefined,
      }),
    );
    expect(await screen.findByText("/root/notes")).toBeInTheDocument();
  });

  it("re-reads the folder, because nothing here watches the filesystem", async () => {
    // Without this the new archive is invisible until the user collapses and
    // re-expands the folder, which reads as the action having done nothing.
    hostReplies({ archive_compress: { path: "/root/readme.rar", warnings: false } });
    const { client } = createFakeTransport({ listings: LISTINGS });
    renderConnected(<FileTreePane />, client);

    await screen.findByRole("treeitem", { name: /readme\.md/ });
    const before = calls(client.listDir);

    const { user } = await openMenuOn(/readme\.md/);
    await user.click(
      await screen.findByRole("menuitem", { name: /Compress "readme\.md" to \.rar/ }),
    );

    await waitFor(() => expect(calls(client.listDir)).toBeGreaterThan(before));
  });

  it("reports a warning as a warning rather than as plain success", async () => {
    // RAR's exit code 1 means the archive exists and something in it was
    // skipped. Calling that success is a lie the user finds out about later.
    hostReplies({ archive_compress: { path: "/root/readme.rar", warnings: true } });
    const { client } = createFakeTransport({ listings: LISTINGS });
    renderConnected(<FileTreePane />, client);

    const { user } = await openMenuOn(/readme\.md/);
    await user.click(
      await screen.findByRole("menuitem", { name: /Compress "readme\.md" to \.rar/ }),
    );

    expect(await screen.findByText("Finished, with warnings")).toBeInTheDocument();
    expect(screen.getByText(/some entries were skipped/)).toBeInTheDocument();
  });

  it("surfaces a failure as a sentence", async () => {
    hostReplies({
      archive_extract: new Error("the archive is corrupt: a checksum did not match"),
    });
    const { client } = createFakeTransport({ listings: LISTINGS });
    renderConnected(<FileTreePane />, client);

    const { user } = await openMenuOn(/notes\.rar/);
    await user.click(await screen.findByRole("menuitem", { name: "Extract here" }));

    expect(await screen.findByText("The archive action failed")).toBeInTheDocument();
    expect(
      screen.getByText("the archive is corrupt: a checksum did not match"),
    ).toBeInTheDocument();
  });

  it("says WinRAR is missing instead of offering actions that cannot work", async () => {
    hostReplies({ archive_available: false });
    const { client } = createFakeTransport({ listings: LISTINGS });
    renderConnected(<FileTreePane />, client);

    await openMenuOn(/notes\.rar/);

    expect(
      await screen.findByText(/WinRAR's command-line tools are not installed/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  it("clears the last result when a new menu opens", async () => {
    // Otherwise the previous action's message stays attached to whatever row
    // the pointer is now over.
    hostReplies({ archive_compress: { path: "/root/readme.rar", warnings: false } });
    const { client } = createFakeTransport({ listings: LISTINGS });
    renderConnected(<FileTreePane />, client);

    const { user } = await openMenuOn(/readme\.md/);
    await user.click(
      await screen.findByRole("menuitem", { name: /Compress "readme\.md" to \.rar/ }),
    );
    expect(await screen.findByText("/root/readme.rar")).toBeInTheDocument();

    await openMenuOn(/notes\.rar/);
    await waitFor(() =>
      expect(screen.queryByText("/root/readme.rar")).not.toBeInTheDocument(),
    );
  });
});
