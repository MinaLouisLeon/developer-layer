import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";

import { Workbench } from "@/features/workbench/components/Workbench";

import { renderConnected } from "../harness";
import { click, rail, sidebarTransport } from "../sidebar-harness";

// The whole workbench is rendered here, terminal included; jsdom cannot host a
// real terminal renderer. See ../xterm-mock.
vi.mock("@xterm/xterm", async () => (await import("../xterm-mock")).terminalModule());
vi.mock("@xterm/addon-fit", async () => (await import("../xterm-mock")).fitAddonModule());

const STORAGE_KEY = "mino.sidebar.v1";

/**
 * What the sidebar restores from a previous session.
 *
 * Local storage is the one place this app writes to, and only for layout
 * preferences - so what it holds must be treated as untrusted input: it can be
 * absent, stale or hand-edited, and none of those may leave the sidebar
 * showing nothing.
 */
describe("sidebar persistence", () => {
  beforeEach(() => window.localStorage.clear());

  it("restores the view chosen in a previous session", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeView: "search", collapsed: false }),
    );
    const { client } = sidebarTransport();
    renderConnected(<Workbench />, client);

    await waitFor(() =>
      expect(rail("Search")).toHaveAttribute("aria-selected", "true"),
    );
  });

  it("remembers the panel it was left collapsed", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeView: "files", collapsed: true }),
    );
    const { client } = sidebarTransport();
    renderConnected(<Workbench />, client);

    await waitFor(() => expect(rail("Files")).toBeInTheDocument());
    expect(rail("Files")).toHaveAttribute("aria-selected", "false");
  });

  it("writes the choice back so the next launch can restore it", async () => {
    const { client } = sidebarTransport();
    renderConnected(<Workbench />, client);

    await waitFor(() => expect(rail("Search")).toBeInTheDocument());
    click(rail("Search"));

    await waitFor(() =>
      expect(window.localStorage.getItem(STORAGE_KEY)).toContain("search"),
    );
  });

  it("falls back to the file tree when the stored view no longer exists", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ activeView: "sourceControl", collapsed: true }),
    );
    const { client } = sidebarTransport();
    renderConnected(<Workbench />, client);

    // The unknown id is discarded, but the collapsed preference beside it is
    // still honoured - so nothing is shown, and Files is what reopens.
    await waitFor(() => expect(rail("Files")).toBeInTheDocument());
    expect(rail("Files")).toHaveAttribute("aria-selected", "false");

    click(rail("Files"));
    await waitFor(() =>
      expect(rail("Files")).toHaveAttribute("aria-selected", "true"),
    );
  });

  it("opens on the file tree when the stored value is not readable at all", async () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    const { client } = sidebarTransport();
    renderConnected(<Workbench />, client);

    await waitFor(() =>
      expect(rail("Files")).toHaveAttribute("aria-selected", "true"),
    );
  });
});
