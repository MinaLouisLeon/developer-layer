import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import type { DirEntry, FilePayload } from "@/Types";
import { useSelection } from "@/features/workbench/context/SelectionContext";
import { useFileEditor } from "@/features/viewer/hooks/useFileEditor";

import { createFakeTransport, makeEntry } from "../fake-transport";
import { withProviders } from "../harness";

/**
 * What happens to an unsaved edit.
 *
 * Switching files mid-edit is a normal thing to do, and an editor that threw
 * the buffer away each time would lose work for no reason the user could see.
 * Driven through the hook for the same reason as `editor.test.tsx`.
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

describe("unsaved drafts", () => {
  /**
   * Switching files mid-edit is normal, and discarding the buffer would lose
   * work for no reason the user could see.
   */
  it("remembers an unsaved draft when the selection moves away and back", async () => {
    const { result } = setup();
    await open(result);
    await waitFor(() => expect(result.current.editor.editable).toBe(true));

    act(() => result.current.editor.onChange("half written"));
    act(() => result.current.selection.select(null));
    await waitFor(() => expect(result.current.editor.draft).toBeNull());

    await open(result);
    await waitFor(() => expect(result.current.editor.draft).toBe("half written"));
    expect(result.current.editor.dirty).toBe(true);
  });

  it("forgets the draft once it is saved", async () => {
    const { result } = setup();
    await open(result);
    await waitFor(() => expect(result.current.editor.editable).toBe(true));

    act(() => result.current.editor.onChange("saved text"));
    await act(async () => {
      await result.current.editor.save();
    });

    act(() => result.current.selection.select(null));
    await open(result);
    await waitFor(() => expect(result.current.editor.draft).toBe("hello"));
    expect(result.current.editor.dirty).toBe(false);
  });
});
