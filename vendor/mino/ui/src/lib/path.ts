/**
 * Path helpers for display only.
 *
 * These never decide what is read: the transport's path guard is the only
 * authority on which paths are reachable. `splitSegments` is the degrade path
 * for the breadcrumb when the structured `path split` call is unavailable.
 *
 * Both helpers accept either separator, because the path style belongs to the
 * target, not to the machine running the UI.
 */
export function basename(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return index === -1 ? trimmed : trimmed.slice(index + 1);
}

/** Breadcrumb segments. Empty pieces from repeated separators are dropped. */
export function splitSegments(path: string): string[] {
  return path.split(/[\\/]+/).filter((segment) => segment.length > 0);
}
