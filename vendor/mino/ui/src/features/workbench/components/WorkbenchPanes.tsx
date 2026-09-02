import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { ActivityBar } from "@/features/sidebar/components/ActivityBar";
import { SidebarPanel } from "@/features/sidebar/components/SidebarPanel";
import { useSidebarPanel } from "@/features/sidebar/hooks/useSidebarPanel";
import { TerminalPane } from "@/features/terminal/components/TerminalPane";
import { ViewerPane } from "@/features/viewer/components/ViewerPane";

import { useWorkbenchLayout } from "../hooks/useWorkbenchLayout";
import { WorkbenchHeader } from "./WorkbenchHeader";

const HANDLE_CLASSES =
  "bg-border transition-colors hover:bg-accentMuted data-[resize-handle-active]:bg-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong";

/**
 * The workbench layout: a header across the top, the activity rail down the
 * left, and the resizable columns beside it.
 *
 * The rail sits outside the `PanelGroup` on purpose. It is a fixed-width strip
 * that must never be dragged or collapsed, and putting it in the group would
 * make it a panel with a size the user could change.
 *
 * Split sizes persist across launches.
 */
export function WorkbenchPanes() {
  const { sizes, onColumnsLayout, onRightLayout } = useWorkbenchLayout();
  const sidebar = useSidebarPanel(onColumnsLayout);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkbenchHeader />
      <div className="flex min-h-0 flex-1">
        <ActivityBar />
        <PanelGroup
          direction="horizontal"
          onLayout={sidebar.onLayout}
          className="min-h-0 flex-1"
        >
          {/* Collapsible rather than conditionally rendered: collapsing must
              not unmount the views, or the tree would lose its expanded
              folders every time the sidebar was hidden. On a launch that
              restores a collapsed sidebar this opens at its stored width for
              one frame before closing - the alternative, starting at zero,
              would throw that width away. */}
          <Panel
            ref={sidebar.ref}
            collapsible
            collapsedSize={0}
            defaultSize={sizes.tree}
            minSize={14}
            order={1}
            onCollapse={sidebar.onCollapse}
            onExpand={sidebar.onExpand}
          >
            <SidebarPanel />
          </Panel>
          <PanelResizeHandle className={`w-1 ${HANDLE_CLASSES}`} />
          <Panel defaultSize={100 - sizes.tree} minSize={30} order={2}>
            <PanelGroup direction="vertical" onLayout={onRightLayout}>
              <Panel defaultSize={sizes.viewer} minSize={20} order={1}>
                <ViewerPane />
              </Panel>
              <PanelResizeHandle className={`h-1 ${HANDLE_CLASSES}`} />
              <Panel defaultSize={sizes.terminal} minSize={15} order={2}>
                <TerminalPane />
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
