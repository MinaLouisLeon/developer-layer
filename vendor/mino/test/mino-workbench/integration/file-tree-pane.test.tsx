import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { TransportError } from "@/Types";
import { FileTreePane } from "@/features/file-tree/components/FileTreePane";

import { createFakeTransport, makeEntry } from "../fake-transport";
import { renderConnected } from "../harness";

const LISTINGS = {
  "/root": [
    makeEntry("/root/src", { kind: "directory" }),
    makeEntry("/root/readme.md"),
  ],
  "/root/src": [makeEntry("/root/src/main.rs")],
};

describe("FileTreePane", () => {
  it("renders the root listing as tree items", async () => {
    const { client } = createFakeTransport({ listings: LISTINGS });
    renderConnected(<FileTreePane />, client);

    expect(await screen.findByRole("treeitem", { name: /src/ })).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: /readme\.md/ })).toBeInTheDocument();
  });

  it("expands a folder on click and marks it expanded", async () => {
    const user = userEvent.setup();
    const { client } = createFakeTransport({ listings: LISTINGS });
    renderConnected(<FileTreePane />, client);

    const folder = await screen.findByRole("treeitem", { name: /src/ });
    expect(folder).toHaveAttribute("aria-expanded", "false");

    await user.click(folder);

    expect(await screen.findByRole("treeitem", { name: /main\.rs/ })).toBeInTheDocument();
    expect(folder).toHaveAttribute("aria-expanded", "true");
  });

  it("expands and collapses from the keyboard", async () => {
    const user = userEvent.setup();
    const { client } = createFakeTransport({ listings: LISTINGS });
    renderConnected(<FileTreePane />, client);

    const folder = await screen.findByRole("treeitem", { name: /src/ });
    folder.focus();
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByRole("treeitem", { name: /main\.rs/ })).toBeInTheDocument();

    await user.keyboard("{ArrowLeft}");
    await waitFor(() =>
      expect(screen.queryByRole("treeitem", { name: /main\.rs/ })).not.toBeInTheDocument(),
    );
  });

  it("explains a folder it cannot read", async () => {
    const denied: TransportError = {
      kind: "permissionDenied",
      detail: { path: "/root" },
    };
    const { client } = createFakeTransport({ failures: { "listDir:/root": denied } });
    renderConnected(<FileTreePane />, client);

    expect(await screen.findByText("Could not read this folder")).toBeInTheDocument();
    expect(
      screen.getByText("You do not have permission to open /root."),
    ).toBeInTheDocument();
  });

  it("says so when the folder is empty", async () => {
    const { client } = createFakeTransport({ listings: { "/root": [] } });
    renderConnected(<FileTreePane />, client);

    expect(await screen.findByText("This folder is empty")).toBeInTheDocument();
  });
});
