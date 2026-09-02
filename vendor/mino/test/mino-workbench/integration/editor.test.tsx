import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import type { DirEntry, FilePayload } from "@/Types";
import { useSelection } from "@/features/workbench/context/SelectionContext";
import { useFileEditor } from "@/features/viewer/hooks/useFileEditor";

import { createFakeTransport, makeEntry } from "../fake-transport";
import { withProviders } from "../harness";

/**
 * Editing and saving.
 *
 * Driven through `useFileEditor` rather than the rendered pane: CodeMirror
 * measures real layout, which jsdom does not provide, and none of what matters
 * here lives in the view. What matters is what reaches the transport - the
 * edited text together with the modification time the editor loaded, because
 * that pair is what stops a save from overwriting somebody else's change.
 * The rendered editor is covered by TC-101 onward instead.
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

function setup(failures?: Record<string, unknown>) {
  const fake = createFakeTransport({
    listings: { "/root": [ENTRY] },
    files: { "/root/readme.md": README },
    failures: failures as never,
  });
  const rendered = renderHook(
    () => ({ selection: useSelection(), editor: useFileEditor() }),
    { wrapper: withProviders(fake.client) },
  );
  return { ...fake, ...rendered };
}

async function open(result: { current: { selection: ReturnType<typeof useSelection> } }) {
  act(() => result.current.selection.select(ENTRY));
}

describe("editing a file", () => {
  it("becomes editable once the file has loaded", async () => {
    const { result } = setup();
    await open(result);

    await waitFor(() => expect(result.current.editor.editable).toBe(true));
    expect(result.current.editor.draft).toBe("hello");
    // Nothing to save until something changes.
    expect(result.current.editor.dirty).toBe(false);
  });

  it("sends the edited text and the loaded mtime when saving", async () => {
    const { result, client } = setup();
    await open(result);
    await waitFor(() => expect(result.current.editor.editable).toBe(true));

    act(() => result.current.editor.onChange("hello!"));
    expect(result.current.editor.dirty).toBe(true);

    await act(async () => {
      await result.current.editor.save();
    });

    expect(client.writeFile).toHaveBeenCalledWith("/root/readme.md", {
      content: "hello!",
      // The guard: what the editor loaded, so a stale save is refused.
      expectedModifiedMs: README.modifiedMs,
    });
    expect(result.current.editor.dirty).toBe(false);
  });

  it("does not call the transport when nothing changed", async () => {
    const { result, client } = setup();
    await open(result);
    await waitFor(() => expect(result.current.editor.editable).toBe(true));

    await act(async () => {
      await result.current.editor.save();
    });

    expect(client.writeFile).not.toHaveBeenCalled();
  });

  /**
   * The case that protects real work: a refused save must leave the edit in
   * place and say so, because the instinct on seeing a failure is that it is
   * gone.
   */
  it("explains a conflict without losing the edit", async () => {
    const { result } = setup({
      "writeFile:/root/readme.md": {
        kind: "conflict",
        detail: {
          path: "/root/readme.md",
          expectedModifiedMs: README.modifiedMs,
          actualModifiedMs: 1_700_000_009_000,
        },
      },
    });
    await open(result);
    await waitFor(() => expect(result.current.editor.editable).toBe(true));

    act(() => result.current.editor.onChange("my work"));
    await act(async () => {
      await result.current.editor.save();
    });

    expect(result.current.editor.saveError).toMatch(/changed on disk/i);
    expect(result.current.editor.saveError).toMatch(/your edits are still here/i);
    // Still dirty, and the text is still the user's.
    expect(result.current.editor.dirty).toBe(true);
    expect(result.current.editor.draft).toBe("my work");
  });
});
