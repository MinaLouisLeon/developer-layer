import { invoke } from "@tauri-apps/api/core";

import type {
  Config,
  Monitor,
  PassReport,
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

/** Run one engine pass: observe, classify, resolve, reconcile, apply. */
export function runPass(): Promise<PassReport> {
  return invoke<PassReport>("run_pass");
}
