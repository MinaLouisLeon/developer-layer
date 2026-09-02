import { useCallback, useState } from "react";

import { useDrafts } from "@/features/viewer/context/DraftsContext";

import type { ChangeGroupModel, ChangeRowModel, DiscardPrompt } from "../types";

interface DiscardInput {
  /** The current groups, so "discard all" knows what it would cover. */
  groups: ChangeGroupModel[];
  /** The panel's action runner: awaits, then re-reads the tree. */
  run: (action: () => Promise<unknown>) => void;
  discard: (paths: string[]) => Promise<void>;
}

/**
 * The confirmation gate in front of the one action that destroys work.
 *
 * Split out of `useSourceControl` so it can be read on its own, because the
 * shape *is* the safeguard: asking and acting are two functions, and the
 * transport call happens in exactly one of them. A discard that could be
 * triggered from anywhere but `confirm` would be a discard nobody agreed to.
 */
export function useDiscardPrompt({ groups, run, discard }: DiscardInput) {
  const drafts = useDrafts();
  const [prompt, setPrompt] = useState<DiscardPrompt | null>(null);

  /** Asks about one row. Does not act. */
  const ask = useCallback((row: ChangeRowModel) => {
    setPrompt({ paths: [row.entry.path], label: row.name });
  }, []);

  /**
   * Asks about every unstaged change.
   *
   * Untracked files are left out: `git restore` has nothing to restore them
   * from, so the panel never offers to remove a file git has never seen.
   */
  const askAll = useCallback(() => {
    const rows = groups.find((group) => group.id === "changes")?.rows ?? [];
    const paths = rows
      .filter((row) => row.entry.worktree !== "untracked")
      .map((row) => row.entry.path);
    if (paths.length === 0) return;
    setPrompt({ paths, label: String(paths.length) });
  }, [groups]);

  const cancel = useCallback(() => setPrompt(null), []);

  const confirm = useCallback(() => {
    if (!prompt) return;
    const { paths } = prompt;
    setPrompt(null);
    // The draft goes with the file. Leaving it would let the viewer keep
    // showing - and one Ctrl+S write back - text that exists nowhere else.
    for (const path of paths) drafts.clear(path);
    run(() => discard(paths));
  }, [prompt, drafts, run, discard]);

  return { prompt, ask, askAll, cancel, confirm };
}
