// A Developer Layer addition. See vendor/mino/VENDOR.md, "Patches".
import { Notice } from "@/components/ui";

import type { ArchiveActions } from "./useArchiveActions";

/**
 * What the last archive action did, above the tree.
 *
 * A warning is shown rather than swallowed: RAR's exit code 1 means the
 * archive exists and something in it was skipped — usually a file that was
 * open — and reporting that as plain success would be a lie the user only
 * discovers when they unpack it.
 */
export function ArchiveStatus({ actions }: { actions: ArchiveActions }) {
  if (actions.busy) {
    return (
      <div className="px-2 pb-1">
        <Notice variant="info">Working…</Notice>
      </div>
    );
  }

  if (actions.error) {
    return (
      <div className="px-2 pb-1">
        <Notice variant="danger" title="The archive action failed">
          {actions.error}
        </Notice>
      </div>
    );
  }

  if (!actions.outcome) return null;

  return (
    <div className="px-2 pb-1">
      <Notice
        variant={actions.outcome.warnings ? "warning" : "info"}
        title={actions.outcome.warnings ? "Finished, with warnings" : "Finished"}
      >
        {actions.outcome.warnings
          ? `${actions.outcome.path} — some entries were skipped.`
          : actions.outcome.path}
      </Notice>
    </div>
  );
}
