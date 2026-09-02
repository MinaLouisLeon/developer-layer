import { useCallback, useEffect, useRef, useState } from "react";

import type { GitChangedFile, GitCommit, GitCommitDetail } from "@/Types";
import { useTransport } from "@/context/TransportContext";
import { useGitStatusContext } from "@/features/git/context/GitStatusContext";
import { absolutePath } from "@/features/git/paths";
import { useViewerMode } from "@/features/viewer/context/ViewerModeContext";
import { describeFailure } from "@/lib/transportError";

import type { HistoryState } from "../types";

/** One page. Matches the transport's own default, said once here. */
const PAGE = 25;

/**
 * The History list.
 *
 * Paged rather than loaded whole: a repository's history is unbounded and the
 * transport bounds every walk, so "show more" asks for the next page instead
 * of the pane pretending it has everything.
 *
 * Selecting a commit reads the files it touched. Selecting one of those opens
 * that file at that commit in the viewer, through `ViewerModeContext` - which
 * also sets the selection, so the rest of the app agrees about which file is
 * open. One selection concept, as the tree and the search results already use.
 */
export function useHistory(active: boolean): HistoryState {
  const transport = useTransport();
  const { availability, repository } = useGitStatusContext();
  const { showCommitFile } = useViewerMode();

  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSha, setOpenSha] = useState<string | null>(null);
  const [detail, setDetail] = useState<GitCommitDetail | null>(null);

  const latest = useRef(0);
  const ready = active && availability === "ready";

  const load = useCallback(
    (skip: number) => {
      const ticket = (latest.current += 1);
      setLoading(true);
      void (async () => {
        try {
          const page = await transport.git.log({ limit: PAGE, skip, path: null });
          if (ticket !== latest.current) return;
          setCommits((current) =>
            skip === 0 ? page.commits : [...current, ...page.commits],
          );
          setMore(page.truncated);
          setError(null);
        } catch (failure) {
          if (ticket !== latest.current) return;
          setError(describeFailure(failure));
        } finally {
          if (ticket === latest.current) setLoading(false);
        }
      })();
    },
    [transport],
  );

  // Only once the view is open. History is not read because a folder was.
  useEffect(() => {
    if (!ready) {
      latest.current += 1;
      setCommits([]);
      setOpenSha(null);
      setDetail(null);
      return;
    }
    load(0);
  }, [ready, load]);

  const openCommit = useCallback(
    (sha: string) => {
      // Clicking the open one closes it, which is how every disclosure in
      // this app behaves.
      if (sha === openSha) {
        setOpenSha(null);
        setDetail(null);
        return;
      }
      setOpenSha(sha);
      setDetail(null);
      void (async () => {
        try {
          setDetail(await transport.git.show(sha));
        } catch (failure) {
          setError(describeFailure(failure));
        }
      })();
    },
    [openSha, transport],
  );

  const openFile = useCallback(
    (file: GitChangedFile) => {
      if (!openSha || !repository) return;
      const path = absolutePath(repository.root, file.relativePath);
      const name = file.relativePath.split("/").pop() ?? file.relativePath;
      showCommitFile(openSha, path, name);
    },
    [openSha, repository, showCommitFile],
  );

  return {
    commits,
    more,
    loading,
    error,
    openSha,
    files: detail?.files ?? null,
    openCommit,
    openFile,
    loadMore: () => load(commits.length),
  };
}
