import { FolderTree, GitBranch, Github, Search } from "lucide-react";

import { FileTreePane } from "@/features/file-tree/components/FileTreePane";
import { SearchPane } from "@/features/search/components/SearchPane";
import { GitHubPane } from "@/features/github/components/GitHubPane";
import { SourceControlPane } from "@/features/source-control/components/SourceControlPane";

import { SIDEBAR_COPY } from "./messages";
import type { SidebarView, SidebarViewId } from "./types";

/**
 * The registry. This array *is* the sidebar - the rail renders one button per
 * entry and the panel renders one region per entry, so nothing else has to
 * change when a view is added.
 *
 * To add a view: add its id to `SidebarViewId`, add its label to
 * `messages.ts`, and add one entry here. Its `Panel` component takes no props
 * and reads whatever it needs from context, exactly as the two below do.
 *
 * Order is the order shown in the rail, top to bottom.
 */
export const SIDEBAR_VIEWS: readonly SidebarView[] = [
  {
    id: "files",
    label: SIDEBAR_COPY.files,
    icon: FolderTree,
    Panel: FileTreePane,
  },
  {
    id: "search",
    label: SIDEBAR_COPY.search,
    icon: Search,
    Panel: SearchPane,
  },
  {
    id: "sourceControl",
    label: SIDEBAR_COPY.sourceControl,
    icon: GitBranch,
    Panel: SourceControlPane,
  },
  // Below source control, because what is happening locally comes before what
  // is happening on a server: you commit before you look at a pull request.
  {
    id: "github",
    label: SIDEBAR_COPY.github,
    icon: Github,
    Panel: GitHubPane,
  },
];

export const DEFAULT_VIEW_ID: SidebarViewId = "files";

/**
 * Guards a stored id. A build that drops a view would otherwise restore a
 * preference naming it and show nothing at all.
 */
export function isKnownViewId(value: unknown): value is SidebarViewId {
  return SIDEBAR_VIEWS.some((view) => view.id === value);
}

/** The DOM id tying a rail button to the region it controls, for `aria-controls`. */
export function viewPanelDomId(id: SidebarViewId): string {
  return `sidebar-panel-${id}`;
}
