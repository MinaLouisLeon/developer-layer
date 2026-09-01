import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type {
  Config,
  DockAction,
  DockEntry,
  MetricsSnapshot,
  Monitor,
  PassReport,
  PinnedApp,
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

// ---- telemetry ----

/**
 * Subscribe to pushed telemetry samples. Returns an unsubscribe function.
 *
 * The backend pushes on its own interval rather than the UI polling, so the
 * sampling rate is owned by one place and the UI never asks for data it has.
 */
export function onTelemetry(
  handler: (snapshot: MetricsSnapshot) => void,
): () => void {
  const pending = listen<MetricsSnapshot>("telemetry", (event) =>
    handler(event.payload),
  );

  return () => {
    void pending.then((unlisten) => unlisten());
  };
}

/** The most recent sample, for a panel that mounts between pushes. */
export function latestMetrics(): Promise<MetricsSnapshot | null> {
  return invoke<MetricsSnapshot | null>("latest_metrics");
}

/** The newest `count` samples, oldest first. */
export function metricsHistory(count: number): Promise<MetricsSnapshot[]> {
  return invoke<MetricsSnapshot[]>("metrics_history", { count });
}

// ---- dock ----

/** Which known applications are installed, without pinning them. */
export function discoverApps(): Promise<PinnedApp[]> {
  return invoke<PinnedApp[]>("discover_apps");
}

/**
 * An application's icon as a PNG data URL, or null if it has none.
 *
 * Extraction is a COM round trip on the Rust side, cached to disk after the
 * first call and keyed on app identity so a Squirrel update does not orphan it.
 */
export function appIcon(app: string): Promise<string | null> {
  return invoke<string | null>("app_icon", { app });
}

export function launchApp(app: string): Promise<void> {
  return invoke<void>("launch_app", { app });
}

/** Re-run discovery, replace the pinned list and persist it. */
export function refreshPinnedApps(): Promise<PinnedApp[]> {
  return invoke<PinnedApp[]>("refresh_pinned_apps");
}

// ---- taskbar replacement ----

/** Pinned applications plus whatever else is running. */
export function dockEntries(): Promise<DockEntry[]> {
  return invoke<DockEntry[]>("dock_entries");
}

/** Act on a dock click; the backend decides what the click means. */
export function clickDockEntry(app: string | null): Promise<DockAction> {
  return invoke<DockAction>("click_dock_entry", { app });
}

/** A window capture as a PNG data URL, or null when there is nothing to show. */
export function windowThumbnail(window: number): Promise<string | null> {
  return invoke<string | null>("window_thumbnail", { window });
}

/**
 * Turn native-taskbar replacement on or off.
 *
 * Enabling starts the guardian process before hiding anything, so a hard kill
 * still restores the shell.
 */
export function setTaskbarReplacement(enabled: boolean): Promise<void> {
  return invoke<void>("set_taskbar_replacement", { enabled });
}
