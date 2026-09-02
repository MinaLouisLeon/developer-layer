import { screen } from "@testing-library/react";

import { createFakeTransport } from "./fake-transport";

/** The tree the search suites walk. */
export const SEARCHABLE = [
  "src/main.rs",
  "src/features/TreePane.tsx",
  "readme.md",
];

export function searchTransport() {
  return createFakeTransport({ searchable: SEARCHABLE });
}

/**
 * The search box, awaited: the harness opens its session asynchronously, so
 * nothing is on screen for the first tick of a test.
 */
export function field() {
  return screen.findByLabelText("Search files by name");
}
