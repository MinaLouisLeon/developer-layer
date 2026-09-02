// A Developer Layer addition to the vendored workbench. See
// vendor/mino/VENDOR.md, "Patches".
//
// This folder is the one place the workbench talks to the host rather than to
// mino's transport, so it calls `invoke` directly rather than going through
// `invokeTransport`: an archive action is not a transport method, and adding
// it to `TransportCommand` would put a Developer Layer command name in the
// file that mirrors `mino_core::transport::Transport`.
//
// The payload types are Rust-generated and imported, never re-typed here.
import { invoke } from "@tauri-apps/api/core";

import type {
  ArchiveOutcome,
  Compression,
  Overwrite,
} from "@developer-layer/shared";

export type { ArchiveOutcome, Compression, Overwrite };

/** Whether WinRAR's console tools are present. Not whether WinRAR is. */
export function archiveAvailable(): Promise<boolean> {
  return invoke<boolean>("archive_available");
}

/** Whether this particular file is one the host can unpack. */
export function archiveSupported(path: string): Promise<boolean> {
  return invoke<boolean>("archive_supported", { path });
}

export function archiveExtract(
  path: string,
  overwrite?: Overwrite,
): Promise<ArchiveOutcome> {
  return invoke<ArchiveOutcome>("archive_extract", { path, overwrite });
}

export function archiveCompress(
  paths: string[],
  compression?: Compression,
): Promise<ArchiveOutcome> {
  return invoke<ArchiveOutcome>("archive_compress", { paths, compression });
}
