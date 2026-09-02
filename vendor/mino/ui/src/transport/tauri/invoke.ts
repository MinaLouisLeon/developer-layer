import { invoke } from "@tauri-apps/api/core";

import type { TransportCommand } from "@/Types";
import { toTransportError } from "@/lib/transportError";

/**
 * The only place the app calls Tauri's `invoke`.
 *
 * Rust commands reject with a serialised `TransportError`; anything else that
 * escapes (a missing command, a killed backend) is normalised into one, so
 * every caller can narrow on `kind` and never has to parse a string.
 */
export async function invokeTransport<T>(
  command: TransportCommand,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toTransportError(error);
  }
}
