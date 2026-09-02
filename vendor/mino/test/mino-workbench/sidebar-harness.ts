import { fireEvent, screen } from "@testing-library/react";

import { createFakeTransport, makeEntry } from "./fake-transport";

/**
 * Shared setup for the sidebar suites, so `sidebar.test.tsx` and
 * `sidebar-persistence.test.tsx` cannot drift into testing two different
 * workbenches.
 */
export function sidebarTransport() {
  return createFakeTransport({
    listings: {
      "/root": [
        makeEntry("/root/src", { kind: "directory" }),
        makeEntry("/root/readme.md"),
      ],
    },
    searchable: ["src/main.rs"],
  });
}

/**
 * `fireEvent` rather than `userEvent` throughout the sidebar suites.
 *
 * react-resizable-panels listens for pointer events on `document.body` in the
 * capture phase and stops the ones it believes are over a resize handle. It
 * decides that from `getBoundingClientRect`, which jsdom answers with zeroes
 * for every element - so with a handle on screen it swallows every pointer
 * event anywhere on the page, and `userEvent.click` becomes a silent no-op.
 * Clicking directly steps over the simulated pointer entirely. A real browser
 * reports real rectangles and is unaffected.
 */
export function click(element: HTMLElement) {
  fireEvent.click(element);
}

/** Rail buttons are tabs; the view being shown is the selected one. */
export function rail(name: "Files" | "Search") {
  return screen.getByRole("tab", { name });
}

/**
 * The region a rail button controls, found by the id in its `aria-controls`.
 *
 * Not by role and name: an inactive view carries the `hidden` attribute, and a
 * hidden element has no accessible name to match on - which is correct, and is
 * the whole point of hiding it.
 */
export function panelFor(name: "Files" | "Search"): HTMLElement {
  const id = rail(name).getAttribute("aria-controls");
  const panel = id === null ? null : document.getElementById(id);
  if (!panel) throw new Error(`no sidebar region is wired to the ${name} tab`);
  return panel;
}
