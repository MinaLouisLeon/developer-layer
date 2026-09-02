import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type { AtlasHit } from "@developer-layer/shared";

/**
 * The command bar's IPC surface.
 *
 * Three calls, and none of them takes a list index. The bar hands back the key
 * Rust gave it, which Rust re-validates against a fresh snapshot — so a row
 * chosen from a list built moments ago cannot run whatever has since taken its
 * place.
 */
export function search(query: string): Promise<AtlasHit[]> {
  return invoke<AtlasHit[]>("atlas_search", { query });
}

export function run(key: string): Promise<void> {
  return invoke<void>("atlas_run", { key });
}

export function setVisible(visible: boolean): Promise<void> {
  return invoke<void>("atlas_toggle", { visible });
}

/** Fired by the backend each time the hotkey reveals the bar. */
export function onOpened(handler: () => void): Promise<() => void> {
  return listen("atlas:opened", () => handler());
}
