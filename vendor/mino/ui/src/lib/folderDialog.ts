import { open } from "@tauri-apps/plugin-dialog";

import { isDesktopRuntime } from "@/transport";

/**
 * The outcome of asking for a folder. Three cases, not two: cancelling is not
 * an error, and "there is no picker here" is not a failure either - it is what
 * the browser build always answers.
 */
export type FolderChoice =
  | { kind: "chosen"; path: string }
  | { kind: "cancelled" }
  | { kind: "unavailable" };

/**
 * The operating system's folder picker.
 *
 * Only ever useful for a *local* session: it browses the machine the app runs
 * on, so a remote session picks its folder from a listing instead - see
 * `useFolderPicker`.
 */
export async function chooseLocalFolder(title: string): Promise<FolderChoice> {
  // The picker is a Tauri capability. In a browser tab there is no runtime to
  // answer it, so this is checked rather than left to throw a type error.
  if (!isDesktopRuntime()) return { kind: "unavailable" };

  const selected = await open({ directory: true, multiple: false, title });
  return typeof selected === "string"
    ? { kind: "chosen", path: selected }
    : { kind: "cancelled" };
}
