import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { SearchHits } from "@/Types";
import { SearchPane } from "@/features/search/components/SearchPane";

import { createFakeTransport } from "../fake-transport";
import { renderConnected } from "../harness";
import { field, searchTransport, SEARCHABLE } from "../search-harness";

const TREE_PANE_HIT: SearchHits = {
  hits: [
    {
      entry: {
        path: "/root/src/features/TreePane.tsx",
        name: "TreePane.tsx",
        kind: "file",
        size: 1,
        modifiedMs: null,
        readonly: false,
        hidden: false,
      },
      relativePath: "src/features/TreePane.tsx",
      score: 10,
      matchIndices: [],
    },
  ],
  truncated: false,
  scanned: 3,
};

/** What the pane does when a search fails, or answers out of order. */
describe("search pane failures", () => {
  it("surfaces a failed search as a sentence rather than an empty list", async () => {
    const user = userEvent.setup();
    const { client } = createFakeTransport({
      searchable: SEARCHABLE,
      failures: {
        searchFiles: { kind: "permissionDenied", detail: { path: "/root" } },
      },
    });
    renderConnected(<SearchPane />, client);

    await user.type(await field(), "main");

    expect(
      await screen.findByText("Could not search this folder"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You do not have permission to open /root."),
    ).toBeInTheDocument();
  });

  it("says so plainly when the transport cannot search at all", async () => {
    const user = userEvent.setup();
    const { client } = createFakeTransport({
      searchable: SEARCHABLE,
      failures: {
        searchFiles: {
          kind: "unimplemented",
          detail: { feature: "search_files", transport: "remoteAgent" },
        },
      },
    });
    renderConnected(<SearchPane />, client);

    await user.type(await field(), "main");

    expect(
      await screen.findByText(
        "Remote agent connections are not available in this build yet.",
      ),
    ).toBeInTheDocument();
  });

  /**
   * The race the sequence number in `useFileSearch` exists for: a first search
   * that resolves late must not replace the results of the one that followed
   * it. Without the guard, deleting a character can leave you looking at
   * results for a query you no longer have.
   */
  it("ignores an answer to a query that has already been replaced", async () => {
    const user = userEvent.setup();
    const { client } = searchTransport();
    const pending = new Map<string, (hits: SearchHits) => void>();

    client.searchFiles = vi.fn(
      (query) =>
        new Promise<SearchHits>((resolve) => {
          pending.set(query.query, resolve);
        }),
    );

    renderConnected(<SearchPane />, client);

    await user.type(await field(), "main");
    await waitFor(() => expect(pending.has("main")).toBe(true));

    await user.clear(await field());
    await user.type(await field(), "tree");
    await waitFor(() => expect(pending.has("tree")).toBe(true));

    // The newer answer lands first, then the stale one.
    pending.get("tree")?.(TREE_PANE_HIT);
    await screen.findByRole("option", { name: /TreePane/ });

    pending.get("main")?.({ hits: [], truncated: false, scanned: 3 });

    // Still showing the newer query's result, not the stale empty answer.
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /TreePane/ })).toBeInTheDocument(),
    );
  });
});
