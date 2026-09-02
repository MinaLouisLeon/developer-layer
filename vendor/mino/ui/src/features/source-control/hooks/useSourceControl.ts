import { useCallback, useMemo, useState } from "react";

import { useTransport } from "@/context/TransportContext";
import { useNotifyGitRefresh } from "@/features/git/context/GitRefreshContext";
import { useGitStatusContext } from "@/features/git/context/GitStatusContext";
import { useSelection } from "@/features/workbench/context/SelectionContext";
import { describeFailure } from "@/lib/transportError";

import { countConflicts, entryFor, groupEntries } from "../grouping";
import { SOURCE_CONTROL_COPY } from "../messages";
import type { ChangeRowModel, SourceControlState } from "../types";
import { useCommitBox } from "./useCommitBox";
import { useDiscardPrompt } from "./useDiscardPrompt";

/**
 * Everything the source control pane needs, so its components stay
 * presentational.
 *
 * Two rules run through all of it.
 *
 * **Nothing refreshes on a timer.** Each action awaits git, then asks
 * `GitStatusContext` to re-read once. A list that re-sorted itself under a
 * cursor would be a list where a click lands on the wrong file, and these rows
 * carry a destructive control.
 *
 * **Discard is never immediate.** It lives in `useDiscardPrompt`, where asking
 * and acting are two separate functions, so there is exactly one path to the
 * one operation that can lose work.
 */
export function useSourceControl(): SourceControlState {
  const transport = useTransport();
  const { availability, entries, truncated, error, refresh } =
    useGitStatusContext();
  const { select } = useSelection();
  const notify = useNotifyGitRefresh();

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const groups = useMemo(() => groupEntries([...entries.values()]), [entries]);

  /**
   * Runs one transport action, then re-reads the tree.
   *
   * The refresh happens whether the call succeeded or not: a partial failure
   * leaves the index somewhere, and showing the old list would be claiming
   * nothing happened.
   */
  const run = useCallback(
    (action: () => Promise<unknown>) => {
      setBusy(true);
      setActionError(null);
      void (async () => {
        try {
          await action();
        } catch (failure) {
          setActionError(describeFailure(failure));
        } finally {
          setBusy(false);
          refresh();
        }
      })();
    },
    [refresh],
  );
  const stageAll = useCallback(
    () => run(() => transport.git.stage([])),
    [run, transport],
  );
  const unstageAll = useCallback(
    () => run(() => transport.git.unstage([])),
    [run, transport],
  );
  const onToggleStaged = useCallback(
    (row: ChangeRowModel) => {
      const paths = [row.entry.path];
      run(() =>
        row.group === "staged"
          ? transport.git.unstage(paths)
          : transport.git.stage(paths),
      );
    },
    [run, transport],
  );

  // The same selection concept the tree and search results use. A deleted file
  // still opens; the viewer reports that it is gone, which is more useful than
  // a row that does nothing.
  const onOpen = useCallback(
    (row: ChangeRowModel) => select(entryFor(row)),
    [select],
  );

  // Asking and acting are two functions in `useDiscardPrompt`, and the
  // transport's discard is reached from exactly one of them. It is also the
  // only action here that rewrites files on disk - staging, unstaging and
  // committing all move the *index* - so it is the only one that announces a
  // working-tree change. Firing that on every stage click would have the tree
  // and the viewer re-read for a change neither of them can see.
  const discard = useDiscardPrompt({
    groups,
    run,
    discard: async (paths) => {
      try {
        await transport.git.discard(paths);
      } finally {
        notify();
      }
    },
  });

  const staged = groups.find((group) => group.id === "staged")?.rows ?? [];
  const changes = groups.find((group) => group.id === "changes")?.rows ?? [];

  const commitState = useCommitBox({
    stagedCount: staged.length,
    // Counted off the status the panel already holds rather than through a
    // call of its own: a conflicted path is a status entry, and the commit box
    // needs the count on every render.
    conflictCount: countConflicts(entries),
    busy,
    run,
  });

  return {
    groups,
    stagedCount: staged.length,
    changesCount: changes.length,
    busy,
    // Git's own failure first: if the tree could not be read, an action error
    // from before it is stale.
    error:
      availability === "failed"
        ? error
        : (actionError ?? (truncated ? SOURCE_CONTROL_COPY.truncated : null)),
    prompt: discard.prompt,
    confirmDiscard: discard.confirm,
    cancelDiscard: discard.cancel,
    stageAll,
    unstageAll,
    discardAll: discard.askAll,
    rowHandlers: { onOpen, onToggleStaged, onDiscard: discard.ask },
    commitState,
  };
}
