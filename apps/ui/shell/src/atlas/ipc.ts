import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type { AtlasHit, Capability } from "@developer-layer/shared";

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

/** Where the voice session is, pushed from the backend. */
export interface VoiceState {
  phase: "off" | "idle" | "listening" | "thinking" | "asking" | "speaking";
  message: string | null;
}

/**
 * One command for every step of a spoken exchange.
 *
 * Deliberately not one per verb: they are a single conversation, and a UI that
 * could call them out of order would be a UI that can answer a question that
 * was never asked.
 */
export type VoiceAction = "press" | "release" | "cancel" | "yes" | "no";

export function voice(action: VoiceAction): Promise<void> {
  return invoke<void>("atlas_voice", { action });
}

export function voiceCapability(): Promise<Capability> {
  return invoke<Capability>("atlas_voice_capability");
}

/** Fired whenever the voice session changes phase. */
export function onVoice(handler: (state: VoiceState) => void): Promise<() => void> {
  return listen<VoiceState>("atlas:voice", (event) => handler(event.payload));
}
