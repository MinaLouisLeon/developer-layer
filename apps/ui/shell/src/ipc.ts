import { invoke } from "@tauri-apps/api/core";

import type {
  Config,
  Monitor,
  PassReport,
  SlotLayout,
  WindowAttributes,
} from "@developer-layer/shared";

/**
 * Typed wrappers over the Tauri command surface.
 *
 * Every command is declared here rather than calling `invoke` inline, so the
 * IPC surface stays enumerable — phase 07's command registry and phase 09's
 * LLM tool-calling both need a single list of what the shell can do.
 */
export function getConfig(): Promise<Config> {
  return invoke<Config>("get_config");
}

export function listMonitors(): Promise<Monitor[]> {
  return invoke<Monitor[]>("list_monitors");
}

export function listWindows(): Promise<WindowAttributes[]> {
  return invoke<WindowAttributes[]>("list_windows");
}

export function getLayout(): Promise<SlotLayout> {
  return invoke<SlotLayout>("get_layout");
}

/** Run one engine pass: observe, classify, resolve, reconcile, apply. */
export function runPass(): Promise<PassReport> {
  return invoke<PassReport>("run_pass");
}

/** Re-enumerate displays; resolves to null when the display set is unchanged. */
export function syncDisplays(): Promise<string | null> {
  return invoke<string | null>("sync_displays");
}

export type EdgeName = "left" | "right" | "top" | "bottom";
export type AxisName = "horizontal" | "vertical";

export function moveBorder(
  slot: string,
  edge: EdgeName,
  delta: number,
): Promise<SlotLayout> {
  return invoke<SlotLayout>("move_border", { slot, edge, delta });
}

export function splitSlot(
  slot: string,
  axis: AxisName,
  newId: string,
): Promise<SlotLayout> {
  return invoke<SlotLayout>("split_slot", { slot, axis, newId });
}

export function removeSlot(slot: string): Promise<SlotLayout> {
  return invoke<SlotLayout>("remove_slot", { slot });
}

export function assignApp(
  slot: string,
  app: string | null,
): Promise<SlotLayout> {
  return invoke<SlotLayout>("assign_app", { slot, app });
}

/** Persist the working layout. Edits live in memory until this is called. */
export function saveLayout(): Promise<void> {
  return invoke<void>("save_layout");
}

export function isDirty(): Promise<boolean> {
  return invoke<boolean>("is_dirty");
}
