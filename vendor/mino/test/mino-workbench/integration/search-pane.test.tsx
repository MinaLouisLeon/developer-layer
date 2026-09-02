import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { FilePayload } from "@/Types";
import { SearchPane } from "@/features/search/components/SearchPane";
import { ViewerPane } from "@/features/viewer/components/ViewerPane";

import { createFakeTransport } from "../fake-transport";
import { renderConnected } from "../harness";
import { field, searchTransport, SEARCHABLE } from "../search-harness";

/**
 * The search pane, through the transport seam.
 *
 * Ranking is not asserted here: it is decided in Rust and proven in
 * `crates/mino-core/tests/local_search.rs`. What matters on this side is the
 * wiring - that typing searches, and that a result opens in the viewer. What
 * happens when a search fails or arrives late is in
 * `search-pane-failures.test.tsx`.
 */
const MAIN_RS: FilePayload = {
  path: "/root/src/main.rs",
  size: 12,
  modifiedMs: 1_700_000_000_000,
  encoding: "utf8",
  content: "fn main() {}",
  extension: "rs",
};

describe("search pane", () => {
  it("asks for nothing until something is typed", async () => {
    const { client } = searchTransport();
    renderConnected(<SearchPane />, client);

    expect(await screen.findByText("Search this folder")).toBeInTheDocument();
    expect(client.searchFiles).not.toHaveBeenCalled();
  });

  it("searches what was typed and lists the matches", async () => {
    const user = userEvent.setup();
    const { client } = searchTransport();
    renderConnected(<SearchPane />, client);

    await user.type(await field(), "main");

    expect(
      await screen.findByRole("option", { name: /main\.rs/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /readme/ })).not.toBeInTheDocument();
    expect(client.searchFiles).toHaveBeenCalledWith(
      expect.objectContaining({ query: "main" }),
    );
  });

  it("debounces so a typed word costs one walk, not one per letter", async () => {
    const user = userEvent.setup();
    const { client } = searchTransport();
    renderConnected(<SearchPane />, client);

    await user.type(await field(), "main");
    await screen.findByRole("option", { name: /main\.rs/ });

    expect(client.searchFiles).toHaveBeenCalledTimes(1);
  });

  it("says so when nothing matches", async () => {
    const user = userEvent.setup();
    const { client } = searchTransport();
    renderConnected(<SearchPane />, client);

    await user.type(await field(), "zzzz");

    expect(await screen.findByText("No matching files")).toBeInTheDocument();
  });

  it("opens a result in the viewer", async () => {
    const user = userEvent.setup();
    const { client } = createFakeTransport({
      searchable: SEARCHABLE,
      files: { "/root/src/main.rs": MAIN_RS },
    });
    renderConnected(
      <>
        <SearchPane />
        <ViewerPane />
      </>,
      client,
    );

    await user.type(await field(), "main");
    await user.click(await screen.findByRole("option", { name: /main\.rs/ }));

    // The editor's label rather than its text: CodeMirror splits highlighted
    // source across spans, so matching the content as one string would break
    // on nothing more than a language mode being applied.
    expect(
      await screen.findByLabelText("Contents of main.rs"),
    ).toBeInTheDocument();
    expect(client.readFile).toHaveBeenCalledWith("/root/src/main.rs");
  });

  it("clears back to the prompt", async () => {
    const user = userEvent.setup();
    const { client } = searchTransport();
    renderConnected(<SearchPane />, client);

    await user.type(await field(), "main");
    await screen.findByRole("option", { name: /main\.rs/ });

    await user.click(screen.getByRole("button", { name: "Clear the search" }));

    expect(await screen.findByText("Search this folder")).toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });
});
