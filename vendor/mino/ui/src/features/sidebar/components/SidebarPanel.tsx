import { useSidebar } from "../context/SidebarContext";
import { SIDEBAR_VIEWS, viewPanelDomId } from "../views";

/**
 * The panel the rail switches.
 *
 * Every view is mounted and the inactive ones are hidden, rather than only the
 * active one being rendered. That is deliberate: unmounting would throw away
 * the file tree's expanded folders and the search box's query every time you
 * looked at the other view, and coming back to a view you had set up only to
 * find it reset is the thing that makes a sidebar feel disposable.
 *
 * The cost is that hidden views stay in memory. Neither does any work while
 * hidden - the tree loads on expand, the search runs on typing - so this is
 * cheap, and it is what to re-examine if a heavier view is ever added here.
 */
export function SidebarPanel() {
  const { activeView } = useSidebar();

  return (
    <div className="h-full min-h-0">
      {SIDEBAR_VIEWS.map((view) => (
        <div
          key={view.id}
          id={viewPanelDomId(view.id)}
          role="tabpanel"
          aria-label={view.label}
          hidden={view.id !== activeView}
          className="h-full min-h-0"
        >
          <view.Panel />
        </div>
      ))}
    </div>
  );
}
