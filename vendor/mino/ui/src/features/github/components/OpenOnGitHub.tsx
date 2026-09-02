import { Github } from "lucide-react";

import { useOpenOnGitHub } from "../hooks/useOpenOnGitHub";
import { OPEN_ON_GITHUB_COPY } from "../messages";

interface OpenOnGitHubProps {
  /** The file the viewer is showing, or `null` when it is showing none. */
  path: string | null;
  /** Read at click time, from the editor. See `useCodeMirror`. */
  currentLine: () => number | null;
}

/**
 * #19 - this file, this line, on github.com.
 *
 * A command on the viewer header rather than a section in the GitHub pane,
 * because it is about the file in front of you and not about the repository.
 *
 * It renders nothing at all when there is no GitHub repository, no file open,
 * or no `gh` - rather than a disabled button. A control that is present but
 * dead is a control the reader keeps trying; one that is absent is a feature
 * that does not apply here, which is the truth.
 *
 * It opens through the operating system's browser, never by navigating this
 * window: see `lib/openExternal`.
 */
export function OpenOnGitHub({ path, currentLine }: OpenOnGitHubProps) {
  const command = useOpenOnGitHub(path, currentLine);
  if (!command.available) return null;

  return (
    <button
      type="button"
      onClick={command.open}
      disabled={command.opening}
      // The failure appears here rather than as a banner: it is about this
      // one action, and the viewer's banners are about the file.
      title={command.error ?? OPEN_ON_GITHUB_COPY.hint}
      className={`flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-xs focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong disabled:opacity-40 ${
        command.error
          ? "border-danger text-danger"
          : "border-border text-textMuted hover:border-borderStrong hover:text-text"
      }`}
    >
      <Github size={12} strokeWidth={1.5} aria-hidden="true" />
      {command.opening
        ? OPEN_ON_GITHUB_COPY.opening
        : OPEN_ON_GITHUB_COPY.label}
    </button>
  );
}
