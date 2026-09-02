import { SIDEBAR_COPY } from "../messages";
import { SIDEBAR_VIEWS } from "../views";
import { ActivityBarButton } from "./ActivityBarButton";

/**
 * The icon rail down the left edge.
 *
 * It sits outside the resizable columns and has a fixed width, so it is the
 * one part of the workbench that never moves - which is what makes it a
 * reliable place to aim for.
 */
export function ActivityBar() {
  return (
    <nav
      role="tablist"
      aria-orientation="vertical"
      aria-label={SIDEBAR_COPY.railLabel}
      className="flex w-12 shrink-0 flex-col border-r border-border bg-surfaceSunken py-1"
    >
      {SIDEBAR_VIEWS.map((view) => (
        <ActivityBarButton key={view.id} view={view} />
      ))}
    </nav>
  );
}
