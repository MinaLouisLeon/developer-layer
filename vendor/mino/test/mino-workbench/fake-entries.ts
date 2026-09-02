import type { DirEntry } from "@/Types";

/**
 * The `DirEntry` builder, beside `fake-transport.ts` rather than in it.
 *
 * It is not part of the transport fake at all - it builds one of the domain
 * types the fake happens to answer with, and every suite that needs a file to
 * select reaches for it. Re-exported through `./fake-transport`, so nothing
 * has to know it moved.
 */
export function makeEntry(path: string, overrides: Partial<DirEntry> = {}): DirEntry {
  const name = path.split(/[\\/]/).pop() ?? path;
  return {
    path,
    name,
    kind: "file",
    size: 12,
    modifiedMs: null,
    readonly: false,
    hidden: name.startsWith("."),
    ...overrides,
  };
}
