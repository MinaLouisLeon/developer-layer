import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import { Workbench } from "@/features/workbench/components/Workbench";

import { createFakeTransport, makeEntry } from "../fake-transport";
import { renderConnected } from "../harness";
import { click, panelFor, rail, sidebarTransport } from "../sidebar-harness";

// The whole workbench is rendered here, terminal included; jsdom cannot host a
// real terminal renderer. See ../xterm-mock.
vi.mock("@xterm/xterm", async () => (await import("../xterm-mock")).terminalModule());
vi.mock("@xterm/addon-fit", async () => (await import("../xterm-mock")).fitAddonModule());

describe("sidebar", () => {
  beforeEach(() => window.localStorage.clear());

  it("opens on the file tree, with the other view mounted but hidden", async () => {
    const { client } = sidebarTransport();
    renderConnected(<Workbench />, client);

    await waitFor(() =>
      expect(rail("Files")).toHaveAttribute("aria-selected", "true"),
    );
    expect(rail("Search")).toHaveAttribute("aria-selected", "false");

    // Both regions exist; only the active one is shown. Search being in the
    // document while hidden is what lets it keep its query.
    expect(panelFor("Files")).toBeVisible();
    expect(panelFor("Search")).not.toBeVisible();
  });

  it("switches the panel when another view is chosen", async () => {
    const { client } = sidebarTransport();
    renderConnected(<Workbench />, client);

    await waitFor(() => expect(rail("Search")).toBeInTheDocument());
    click(rail("Search"));

    await waitFor(() =>
      expect(rail("Search")).toHaveAttribute("aria-selected", "true"),
    );
    expect(rail("Files")).toHaveAttribute("aria-selected", "false");
    expect(panelFor("Search")).toBeVisible();
    expect(panelFor("Files")).not.toBeVisible();
  });

  it("collapses when the view already showing is clicked again", async () => {
    const { client } = sidebarTransport();
    renderConnected(<Workbench />, client);

    await waitFor(() =>
      expect(rail("Files")).toHaveAttribute("aria-selected", "true"),
    );

    click(rail("Files"));
    // Nothing is being shown, so no tab is selected.
    await waitFor(() =>
      expect(rail("Files")).toHaveAttribute("aria-selected", "false"),
    );
    expect(rail("Search")).toHaveAttribute("aria-selected", "false");

    click(rail("Files"));
    await waitFor(() =>
      expect(rail("Files")).toHaveAttribute("aria-selected", "true"),
    );
  });

  it("keeps the tree's expanded folders across a view switch", async () => {
    const { client } = createFakeTransport({
      listings: {
        "/root": [makeEntry("/root/src", { kind: "directory" })],
        "/root/src": [makeEntry("/root/src/main.rs")],
      },
    });
    renderConnected(<Workbench />, client);

    click(await screen.findByRole("treeitem", { name: /src/ }));
    expect(
      await screen.findByRole("treeitem", { name: /main\.rs/ }),
    ).toBeInTheDocument();

    click(rail("Search"));
    await waitFor(() =>
      expect(rail("Search")).toHaveAttribute("aria-selected", "true"),
    );
    click(rail("Files"));
    await waitFor(() =>
      expect(rail("Files")).toHaveAttribute("aria-selected", "true"),
    );

    // Still expanded: the view was hidden, not unmounted.
    expect(
      screen.getByRole("treeitem", { name: /main\.rs/ }),
    ).toBeInTheDocument();
  });
});
