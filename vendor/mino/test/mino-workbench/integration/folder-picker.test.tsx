import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WorkbenchHeader } from "@/features/workbench/components/WorkbenchHeader";

import { createFakeTransport, makeEntry } from "../fake-transport";
import { renderConnected, sshTarget } from "../harness";

/**
 * The remote folder picker.
 *
 * A native dialog cannot choose a folder on another machine, so a remote
 * session browses a real listing instead. These exercise that browser through
 * the transport interface, which is the only thing it is allowed to touch.
 */
function transportWithTree() {
  return createFakeTransport({
    listings: {
      "/home/nu": [
        makeEntry("/home/nu/projects", { kind: "directory" }),
        makeEntry("/home/nu/notes.md"),
      ],
      "/home/nu/projects": [
        makeEntry("/home/nu/projects/api", { kind: "directory" }),
      ],
    },
  });
}

describe("folder picker", () => {
  it("lists only directories, because a file cannot be a working folder", async () => {
    const { client } = transportWithTree();
    renderConnected(<WorkbenchHeader />, client, "/home/nu", sshTarget("/home/nu"));

    await userEvent.click(await screen.findByRole("button", { name: "Change folder" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "projects" })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "notes.md" })).not.toBeInTheDocument();
  });

  it("walks down into a folder and lists it", async () => {
    const { client } = transportWithTree();
    renderConnected(<WorkbenchHeader />, client, "/home/nu", sshTarget("/home/nu"));

    await userEvent.click(await screen.findByRole("button", { name: "Change folder" }));
    await userEvent.click(await screen.findByRole("button", { name: "projects" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "api" })).toBeInTheDocument(),
    );
    expect(client.listDir).toHaveBeenCalledWith("/home/nu/projects");
  });

  it("re-roots the session to the folder that was chosen", async () => {
    const { client } = transportWithTree();
    renderConnected(<WorkbenchHeader />, client, "/home/nu", sshTarget("/home/nu"));

    await userEvent.click(await screen.findByRole("button", { name: "Change folder" }));
    await userEvent.click(await screen.findByRole("button", { name: "projects" }));
    await waitFor(() => expect(client.listDir).toHaveBeenCalledWith("/home/nu/projects"));
    await userEvent.click(screen.getByRole("button", { name: "Use this folder" }));

    await waitFor(() =>
      expect(client.connect).toHaveBeenCalledWith(
        sshTarget("/home/nu/projects"),
      ),
    );
  });

  it("says so when a folder cannot be read, instead of emptying the list", async () => {
    const { client } = createFakeTransport({
      listings: { "/home/nu": [makeEntry("/home/nu/locked", { kind: "directory" })] },
      failures: {
        "listDir:/home/nu/locked": {
          kind: "permissionDenied",
          detail: { path: "/home/nu/locked" },
        },
      },
    });
    renderConnected(<WorkbenchHeader />, client, "/home/nu", sshTarget("/home/nu"));

    await userEvent.click(await screen.findByRole("button", { name: "Change folder" }));
    await userEvent.click(await screen.findByRole("button", { name: "locked" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("closes without touching the session when cancelled", async () => {
    const { client } = transportWithTree();
    renderConnected(<WorkbenchHeader />, client, "/home/nu", sshTarget("/home/nu"));

    await userEvent.click(await screen.findByRole("button", { name: "Change folder" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // One connect only: the session opened, and nothing re-rooted it.
    expect(client.connect).toHaveBeenCalledTimes(1);
  });
});
