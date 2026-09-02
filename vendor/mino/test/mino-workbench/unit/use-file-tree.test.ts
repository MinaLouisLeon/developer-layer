import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { TransportError } from "@/Types";
import { useFileTree } from "@/features/file-tree/hooks/useFileTree";

import { createFakeTransport, makeEntry } from "../fake-transport";
import { withProviders } from "../harness";

const LISTINGS = {
  "/root": [
    makeEntry("/root/src", { kind: "directory" }),
    makeEntry("/root/readme.md"),
  ],
  "/root/src": [makeEntry("/root/src/main.rs")],
};

describe("useFileTree", () => {
  it("loads the root only, never a recursive walk", async () => {
    const { client } = createFakeTransport({ listings: LISTINGS });
    const { result } = renderHook(() => useFileTree("/root"), {
      wrapper: withProviders(client),
    });

    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(client.listDir).toHaveBeenCalledTimes(1);
    expect(client.listDir).toHaveBeenCalledWith("/root");
  });

  it("fetches a folder's children the first time it is expanded", async () => {
    const { client } = createFakeTransport({ listings: LISTINGS });
    const { result } = renderHook(() => useFileTree("/root"), {
      wrapper: withProviders(client),
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(2));

    const folder = result.current.rows[0]!;
    act(() => result.current.setExpanded(folder, true));

    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(client.listDir).toHaveBeenCalledWith("/root/src");
    expect(client.listDir).toHaveBeenCalledTimes(2);
  });

  it("keeps a failed level's error on that row alone", async () => {
    const denied: TransportError = {
      kind: "permissionDenied",
      detail: { path: "/root/src" },
    };
    const { client } = createFakeTransport({
      listings: LISTINGS,
      failures: { "listDir:/root/src": denied },
    });
    const { result } = renderHook(() => useFileTree("/root"), {
      wrapper: withProviders(client),
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(2));

    act(() => result.current.setExpanded(result.current.rows[0]!, true));

    await waitFor(() =>
      expect(result.current.rows[0]?.error).toBe(
        "You do not have permission to open /root/src.",
      ),
    );
    // The sibling file is still listed: one bad level does not blank the tree.
    expect(result.current.rows).toHaveLength(2);
  });

  it("surfaces a root failure as the tree's own status", async () => {
    const { client } = createFakeTransport({
      failures: { "listDir:/root": { kind: "notConnected" } },
    });
    const { result } = renderHook(() => useFileTree("/root"), {
      wrapper: withProviders(client),
    });

    await waitFor(() => expect(result.current.rootStatus).toBe("error"));
    expect(result.current.rootError).toBe(
      "No folder is open yet. Choose a folder to get started.",
    );
  });
});
