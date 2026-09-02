import { useSidebar } from "../context/SidebarContext";
import { SIDEBAR_COPY } from "../messages";
import type { SidebarView } from "../types";
import { viewPanelDomId } from "../views";

/**
 * One rail button.
 *
 * A tab rather than a toggle: it selects which region is shown. When the panel
 * is collapsed no tab is selected, which is the honest reading - nothing is
 * being shown - and it is why `selected` checks `collapsed` as well as the id.
 */
export function ActivityBarButton({ view }: { view: SidebarView }) {
  const { activeView, collapsed, activate } = useSidebar();
  const isActiveView = view.id === activeView;
  const selected = isActiveView && !collapsed;
  const Icon = view.icon;

  // The active button toggles rather than switches, so its tooltip has to say
  // which of the two it will do.
  const hint = isActiveView
    ? `${collapsed ? SIDEBAR_COPY.showPanel : SIDEBAR_COPY.hidePanel} ${view.label}`
    : view.label;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      aria-controls={viewPanelDomId(view.id)}
      aria-label={view.label}
      title={hint}
      onClick={() => activate(view.id)}
      className={`relative flex h-11 w-full items-center justify-center focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accentStrong ${
        selected ? "text-accentStrong" : "text-textFaint hover:text-text"
      }`}
    >
      {/* The lit edge marking the open view, as an element rather than a
          border so the icon never shifts by a pixel when it appears. */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-1 left-0 w-0.5 rounded-r ${
          selected ? "bg-accent" : "bg-transparent"
        }`}
      />
      <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}
