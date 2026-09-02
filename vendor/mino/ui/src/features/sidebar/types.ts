import type { ComponentType } from "react";

import type { LucideIcon } from "lucide-react";

/**
 * The views the activity rail can switch between.
 *
 * Adding one means adding its id here and an entry in `views.ts`. Keeping the
 * union closed rather than widening it to `string` is what makes a forgotten
 * registry entry a type error instead of a blank panel at runtime.
 */
export type SidebarViewId = "files" | "search" | "sourceControl" | "github";

/** One entry in the rail: what it is called, what it looks like, what it shows. */
export interface SidebarView {
  id: SidebarViewId;
  /** The rail tooltip, the panel's accessible name, and the pane heading. */
  label: string;
  icon: LucideIcon;
  /** Rendered inside the sidebar panel. Takes no props: a view reads context. */
  Panel: ComponentType;
}

/** What survives a restart. Layout preference only - see `usePersistentState`. */
export interface SidebarState {
  activeView: SidebarViewId;
  collapsed: boolean;
}

export interface SidebarContextValue extends SidebarState {
  /**
   * Rail click. Selecting a different view switches to it and opens the panel;
   * selecting the view already showing collapses the panel, which is the
   * behaviour a VS Code user's hands already know.
   */
  activate: (id: SidebarViewId) => void;
  /** Used by the resize handle, which can collapse the panel by dragging. */
  setCollapsed: (collapsed: boolean) => void;
}
