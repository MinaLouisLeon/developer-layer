import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { FilePayload, TransportError } from "@/Types";
import { FileTreePane } from "@/features/file-tree/components/FileTreePane";
import { ViewerPane } from "@/features/viewer/components/ViewerPane";

import { createFakeTransport, makeEntry } from "../fake-transport";
import { renderConnected } from "../harness";

const LISTINGS = {
  "/root": [
    makeEntry("/root/readme.md"),
    makeEntry("/root/app.bin"),
    makeEntry("/root/big.log"),
  ],
};

const README: FilePayload = {
  path: "/root/readme.md",
  size: 11,
  modifiedMs: 1_700_000_000_000,
  encoding: "utf8",
  content: "hello world",
  extension: "md",
};

function renderPanes(failures?: Record<string, TransportError>) {
  const { client } = createFakeTransport({
    listings: LISTINGS,
    files: { "/root/readme.md": README },
    ...(failures ? { failures } : {}),
  });
  renderConnected(
    <>
      <FileTreePane />
      <ViewerPane />
    </>,
    client,
  );
  return client;
}

describe("ViewerPane", () => {
  it("starts empty with an instruction, not a blank box", async () => {
    renderPanes();
    expect(await screen.findByText("No file selected")).toBeInTheDocument();
  });

  it("reads the file the tree selected", async () => {
    const user = userEvent.setup();
    const client = renderPanes();

    await user.click(await screen.findByRole("treeitem", { name: /readme\.md/ }));

    expect(await screen.findByLabelText("Contents of readme.md")).toBeInTheDocument();
    expect(client.readFile).toHaveBeenCalledWith("/root/readme.md");
  });

  it("refuses a binary file with the guard's own wording", async () => {
    const user = userEvent.setup();
    renderPanes({
      "readFile:/root/app.bin": {
        kind: "binaryFile",
        detail: { path: "/root/app.bin", size: 2048 },
      },
    });

    await user.click(await screen.findByRole("treeitem", { name: /app\.bin/ }));

    expect(await screen.findByText("This file is not shown")).toBeInTheDocument();
    expect(
      screen.getByText("This looks like a binary file (2 KB), so it is not shown here."),
    ).toBeInTheDocument();
  });

  it("refuses a file above the size ceiling", async () => {
    const user = userEvent.setup();
    renderPanes({
      "readFile:/root/big.log": {
        kind: "tooLarge",
        detail: { path: "/root/big.log", size: 5242880, limit: 2097152 },
      },
    });

    await user.click(await screen.findByRole("treeitem", { name: /big\.log/ }));

    expect(await screen.findByText("This file is not shown")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This file is 5 MB and the viewer stops at 2 MB. Open it in an external editor instead.",
      ),
    ).toBeInTheDocument();
  });
});
