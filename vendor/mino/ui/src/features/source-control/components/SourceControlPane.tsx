import { Notice, Pane, StatusMessage } from "@/components/ui";
import { useGitStatusContext } from "@/features/git/context/GitStatusContext";
import { useSelection } from "@/features/workbench/context/SelectionContext";

import { useSourceControl } from "../hooks/useSourceControl";
import { SOURCE_CONTROL_COPY } from "../messages";
import { BranchControl } from "./BranchControl";
import { ChangeGroup } from "./ChangeGroup";
import { CommitBox } from "./CommitBox";
import { ConflictSection } from "./ConflictSection";
import { DiscardConfirm } from "./DiscardConfirm";
import { GroupActions } from "./GroupActions";
import { HistorySection } from "./HistorySection";
import { RemoteSection } from "./RemoteSection";
import { StashSection } from "./StashSection";

/** Presentational: every decision it renders comes from useSourceControl. */
export function SourceControlPane() {
  const { availability } = useGitStatusContext();
  const { selected } = useSelection();
  const control = useSourceControl();

  if (availability === "absent" || availability === "notARepository") {
    const absent = availability === "absent";
    return (
      <Pane title={SOURCE_CONTROL_COPY.title}>
        <StatusMessage
          title={
            absent
              ? SOURCE_CONTROL_COPY.absentTitle
              : SOURCE_CONTROL_COPY.notARepositoryTitle
          }
          description={
            absent
              ? SOURCE_CONTROL_COPY.absentDescription
              : SOURCE_CONTROL_COPY.notARepositoryDescription
          }
        />
      </Pane>
    );
  }

  if (availability === "loading") {
    return (
      <Pane title={SOURCE_CONTROL_COPY.title}>
        <StatusMessage title={SOURCE_CONTROL_COPY.loadingTitle} />
      </Pane>
    );
  }

  const empty = control.stagedCount === 0 && control.changesCount === 0;

  return (
    <Pane title={SOURCE_CONTROL_COPY.title}>
      {/* `relative` so the discard confirmation covers this pane and not the
          whole window - it is about a file in this list.

          `overflow-hidden` is what stops that costing a second scrollbar. A
          positioned box reports its scrollable descendants' *content* in its
          own `scrollHeight`, so `Pane`'s body saw 1845px inside a 786px child
          that fits it exactly, and grew a scrollbar of its own beside the
          list's. Clipping here is free - the two children already add up to
          exactly this height - and it keeps the overlay anchored. */}
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
        {/* Above the commit box, because which branch you are on is the first
            thing that decides whether the rest of this pane is what you meant
            to be looking at. */}
        <BranchControl active={availability === "ready"} />

        {/* Above everything else, and it renders nothing when there is
            nothing conflicted. A conflict blocks the commit box, so a reader
            who had to scroll to find out why would be left with a disabled
            button and no explanation. */}
        <ConflictSection active={availability === "ready"} />

        <CommitBox state={control.commitState} />

        {control.error ? (
          <div className="px-2 pt-2">
            <Notice variant="danger" title={SOURCE_CONTROL_COPY.errorTitle}>
              {control.error}
            </Notice>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {empty ? (
            <StatusMessage
              title={SOURCE_CONTROL_COPY.cleanTitle}
              description={SOURCE_CONTROL_COPY.cleanDescription}
            />
          ) : (
            control.groups.map((group) => (
              <ChangeGroup
                key={group.id}
                group={group}
                selectedPath={selected?.path ?? null}
                busy={control.busy}
                handlers={control.rowHandlers}
              >
                <GroupActions
                  group={group.id}
                  busy={control.busy}
                  control={control}
                />
              </ChangeGroup>
            ))
          )}

          {/* Below the working tree, because what changed *now* is the reason
              the panel is open; the stash and history are what you scroll to.
              The stash sits above history: it is work you can bring back, and
              history is work already landed. */}
          {/* Below the working tree and above the stash: what to send and
              what to bring down is the next thing after what changed. */}
          <RemoteSection active={availability === "ready"} />
          <StashSection active={availability === "ready"} />
          <HistorySection active={availability === "ready"} />
        </div>

        <DiscardConfirm
          prompt={control.prompt}
          onConfirm={control.confirmDiscard}
          onCancel={control.cancelDiscard}
        />
      </div>
    </Pane>
  );
}
