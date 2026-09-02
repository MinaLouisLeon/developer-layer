import { Minus, Plus, Undo2 } from "lucide-react";

import { SOURCE_CONTROL_COPY } from "../messages";
import type { ChangeGroupId, SourceControlState } from "../types";

interface GroupActionsProps {
  group: ChangeGroupId;
  busy: boolean;
  control: Pick<SourceControlState, "stageAll" | "unstageAll" | "discardAll">;
}

const ACTION_CLASSES =
  "rounded p-1 text-textFaint hover:bg-surfaceHover hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong disabled:opacity-40";

/**
 * The controls in a group's header: unstage-all for the staged side,
 * discard-all and stage-all for the other.
 *
 * Split out of `SourceControlPane` when the pane grew a branch control and a
 * stash section - the pane's job is which sections exist and in what order,
 * and forty lines of buttons was drowning it.
 *
 * Discard sits to the *left* of stage, never as the last thing under the
 * cursor, and is never styled as the primary action. It is the one control
 * here that can lose work.
 */
export function GroupActions({ group, busy, control }: GroupActionsProps) {
  if (group === "staged") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={control.unstageAll}
        title={SOURCE_CONTROL_COPY.unstageAll}
        className={ACTION_CLASSES}
      >
        <Minus size={14} strokeWidth={1.5} aria-hidden="true" />
        <span className="sr-only">{SOURCE_CONTROL_COPY.unstageAll}</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={control.discardAll}
        title={SOURCE_CONTROL_COPY.discardAll}
        className={ACTION_CLASSES}
      >
        <Undo2 size={14} strokeWidth={1.5} aria-hidden="true" />
        <span className="sr-only">{SOURCE_CONTROL_COPY.discardAll}</span>
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={control.stageAll}
        title={SOURCE_CONTROL_COPY.stageAll}
        className={ACTION_CLASSES}
      >
        <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
        <span className="sr-only">{SOURCE_CONTROL_COPY.stageAll}</span>
      </button>
    </>
  );
}
