import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Driving the branch picker, shared by the suites that need it.
 *
 * Beside the fakes rather than inside one test file, for the reason
 * `search-harness.ts` is: three suites open this picker, and three copies of
 * "click the strip, wait for the listbox" is three places to update when the
 * control changes.
 *
 * Every helper `find`s rather than `get`s, because the harness opens its
 * session asynchronously and nothing is on screen for the first tick.
 */
export async function openPicker() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /branch: main/i }));
  await screen.findByRole("listbox", { name: /switch branch/i });
  return user;
}

/** Opens the picker and chooses `dev`, which is what fires a checkout. */
export async function chooseDev() {
  const user = await openPicker();
  await user.click(screen.getByRole("option", { name: /dev/ }));
  return user;
}

/** The branch strip, which keeps showing the branch you are on. */
export function branchStrip() {
  return screen.findByRole("button", { name: /branch: main/i });
}
