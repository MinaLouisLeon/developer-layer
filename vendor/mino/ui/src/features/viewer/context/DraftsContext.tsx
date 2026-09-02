import { createContext, useContext, useRef } from "react";
import type { ReactNode } from "react";

import { DraftStore } from "../drafts";

const DraftsContext = createContext<DraftStore | null>(null);

/**
 * The session's unsaved edits, in one place both the editor and source control
 * can reach.
 *
 * The store used to live in a ref inside `useFileEditor`, which was right
 * while the editor was the only thing that knew about drafts. Discard changed
 * that: throwing away a file's working-tree changes while the viewer still
 * holds an unsaved draft of it would leave the editor showing text that exists
 * nowhere - not on disk, not in the index, not in a commit - and one Ctrl+S
 * away from writing it back.
 *
 * So the store is lifted here and both features read it. It is still memory
 * only: nothing unsaved is written anywhere, which keeps the app's promise
 * that it persists layout preferences and nothing else.
 */
export function DraftsProvider({ children }: { children: ReactNode }) {
  // A ref, not state: the store mutates in place and nothing re-renders on a
  // draft change. What re-renders is the editor's own `draft` state.
  const store = useRef(new DraftStore());
  return (
    <DraftsContext.Provider value={store.current}>
      {children}
    </DraftsContext.Provider>
  );
}

export function useDrafts(): DraftStore {
  const drafts = useContext(DraftsContext);
  if (!drafts) {
    throw new Error("useDrafts must be used inside a DraftsProvider");
  }
  return drafts;
}
