import { describe, expect, it } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";

import type { DirEntry, FilePayload } from "@/Types";
import { SourceControlPane } from "@/features/source-control/components/SourceControlPane";
import { useFileEditor } from "@/features/viewer/hooks/useFileEditor";
import { useSelection } from "@/features/workbench/context/SelectionContext";

import {
  CLEAN_REPOSITORY,
  createFakeTransport,
  makeBranch,
  makeEntry,
} from "../fake-transport";
import { chooseDev } from "../branch-harness";
import { renderConnected } from "../harness";

/**
 * The highest-severity risk in the phase: a checkout that would strand an
 * unsaved edit.
 *
 * Git cannot help here - a draft was never written to disk - so the only place
 * it can be caught is in front of the call. That is what the second test
 * asserts, and it is the one that matters most: **the transport is not called
 * until the reader has answered.**
 *
 * The editor and the panel are rendered into one tree on purpose. They know
 * nothing about each other; the shared draft store is the only thing that
 * connects them, and testing them apart would not exercise the connection.
 */
const README: FilePayload = {
  path: "/root/readme.md",
  size: 5,
  modifiedMs: 1_700_000_000_000,
  encoding: "utf8",
  content: "hello",
  extension: "md",
};

const ENTRY: DirEntry = makeEntry("/root/readme.md");
const BRANCHES = [makeBranch("main", { isHead: true }), makeBranch("dev")];

/** The two hooks the editor half of each test drives. */
interface Probed {
  selection: ReturnType<typeof useSelection>;
  editor: ReturnType<typeof useFileEditor>;
}

/**
 * Renders the panel, and optionally an editor beside it in the same provider
 * tree. `probe` reaches the editor's hooks without a second render root -
 * which would mean a second draft store, and no connection to test.
 */
function setup({ withEditor = false } = {}) {
  const { client } = createFakeTransport({
    repository: CLEAN_REPOSITORY,
    branches: BRANCHES,
    listings: { "/root": [ENTRY] },
    files: { "/root/readme.md": README },
  });
  const probe: { current: Probed | null } = { current: null };

  function Probe() {
    probe.current = { selection: useSelection(), editor: useFileEditor() };
    return null;
  }

  renderConnected(
    <>
      {withEditor ? <Probe /> : null}
      <SourceControlPane />
    </>,
    client,
  );
  return { client, probe };
}

/**
 * Opens the file and types into it, leaving an unsaved draft behind. The first
 * wait is for the *connection*: `renderConnected` renders nothing until the
 * session opens, so the probe has not run when a test starts.
 */
async function leaveADraft(probe: { current: Probed | null }) {
  await waitFor(() => expect(probe.current).not.toBeNull());
  act(() => probe.current?.selection.select(ENTRY));
  await waitFor(() => expect(probe.current?.editor.editable).toBe(true));
  act(() => probe.current?.editor.onChange("half written"));
}

describe("a checkout that would strand an unsaved draft", () => {
  it("switches straight away when nothing is unsaved", async () => {
    const { client } = setup();
    await chooseDev();

    // No confirmation at all: one nobody needs is one people learn to click
    // past, which would make the one that matters useless.
    await waitFor(() => expect(client.git.checkout).toHaveBeenCalledWith("dev"));
    expect(
      screen.queryByRole("alertdialog", { name: /unsaved changes/i }),
    ).toBeNull();
  });

  it("warns first, and does not call the transport until answered", async () => {
    const { client, probe } = setup({ withEditor: true });
    await leaveADraft(probe);

    await chooseDev();

    const dialog = await screen.findByRole("alertdialog", {
      name: /unsaved changes/i,
    });
    // Named, not counted: a warning that does not say which file is one
    // nobody can act on.
    expect(dialog).toHaveTextContent("readme.md");
    expect(client.git.checkout).not.toHaveBeenCalled();
  });

  it("keeps the edit when the reader goes back to save", async () => {
    const { client, probe } = setup({ withEditor: true });
    await leaveADraft(probe);

    const user = await chooseDev();
    await user.click(
      await screen.findByRole("button", { name: /stay here and save/i }),
    );

    expect(client.git.checkout).not.toHaveBeenCalled();
    // The draft is untouched. Neither answer throws an edit away.
    expect(probe.current?.editor.draft).toBe("half written");
  });

  it("switches when confirmed, and still writes nothing out", async () => {
    const { client, probe } = setup({ withEditor: true });
    await leaveADraft(probe);

    const user = await chooseDev();
    await user.click(
      await screen.findByRole("button", { name: /switch to dev anyway/i }),
    );

    await waitFor(() => expect(client.git.checkout).toHaveBeenCalledWith("dev"));
    // Saving the edit onto the *other* branch's file is the other half of the
    // risk, and nothing here does it on the reader's behalf.
    expect(client.writeFile).not.toHaveBeenCalled();
  });
});
