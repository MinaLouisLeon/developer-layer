import { Notice } from "@/components/ui";
import { GitBranchStatus } from "@/features/git/components/GitBranchStatus";

import { useSessionContext } from "../context/SessionContext";
import { useChangeFolder } from "../hooks/useChangeFolder";
import { useFolderPicker } from "../hooks/useFolderPicker";
import { WORKBENCH_COPY } from "../messages";
import { Breadcrumb } from "./Breadcrumb";
import { FolderPicker } from "./FolderPicker";

/** The title strip: what is open, how to move it, and the way back out. */
export function WorkbenchHeader() {
  const { connection, disconnect } = useSessionContext();
  const picker = useFolderPicker();
  const { request, error } = useChangeFolder(picker);

  return (
    <>
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-surfaceRaised px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 text-sm font-semibold text-text">
            {connection?.label ?? "Mino Workbench"}
          </span>
          <Breadcrumb path={connection?.root ?? null} />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {/* Reads GitStatusContext rather than taking props: the header is
              already at its prop budget, and the branch, the dirty marker and
              the ahead/behind counts are four more. */}
          <GitBranchStatus />
          <button
            type="button"
            onClick={() => void request()}
            className="rounded border border-border px-2 py-1 text-xs text-textMuted hover:border-borderStrong hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
          >
            {WORKBENCH_COPY.changeFolder}
          </button>
          <button
            type="button"
            onClick={() => void disconnect()}
            className="rounded border border-border px-2 py-1 text-xs text-textMuted hover:border-borderStrong hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
          >
            {WORKBENCH_COPY.closeFolder}
          </button>
        </div>
      </header>

      {error ? (
        <div className="px-3 pt-2">
          <Notice variant="danger" title={WORKBENCH_COPY.pickerErrorTitle}>
            {error}
          </Notice>
        </div>
      ) : null}

      <FolderPicker picker={picker} />
    </>
  );
}
