/**
 * Turning a repository-relative path back into an absolute one.
 *
 * The mirror of `mino_core::git::paths::PathStyle`, and needed for the same
 * reason: git answers in forward slashes on every platform, while the rest of
 * the app addresses files the way the target writes them. The history list has
 * `src/main.rs` and a repository root, and needs the path the viewer opens.
 *
 * The separator is read from the root rather than from the machine running the
 * UI - a Windows client browsing a Linux host over SSH is the ordinary case.
 */
export function separatorOf(root: string): string {
  return root.includes("\\") ? "\\" : "/";
}

export function absolutePath(root: string, relative: string): string {
  const separator = separatorOf(root);
  // Written as a loop rather than a regex: the character class needed here is
  // an escaped backslash, which is the easiest thing in this file to get
  // subtly wrong and the hardest to notice afterwards.
  let trimmed = root;
  while (trimmed.endsWith("/") || trimmed.endsWith("\\")) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}${separator}${relative.split("/").join(separator)}`;
}
