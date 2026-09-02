import { ExternalLink as ExternalLinkIcon } from "lucide-react";

import { openExternal } from "@/lib/openExternal";

interface ExternalLinkProps {
  url: string;
  /** The tooltip and the screen-reader name. Says where it goes. */
  title: string;
}

/**
 * A **button**, not an anchor, and that is the whole point of the component.
 *
 * Every URL here came from `gh`, which is to say from GitHub, which is to say
 * from outside. An `<a href>` in a webview is a page that can be navigated to
 * an address somebody else supplied; this hands the URL to the operating
 * system's browser instead and the workbench stays where it was. `openExternal`
 * checks the origin, and `capabilities/default.json` scopes the runtime
 * permission to github.com so the check holds even if this file is wrong.
 *
 * A failure is swallowed on purpose - and only here. There is nowhere to show
 * a notice from inside a row, and "the browser did not open" is a thing the
 * reader can see for themselves; the calls that *matter* report their failures
 * through their own section.
 */
export function ExternalLink({ url, title }: ExternalLinkProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={() => void openExternal(url).catch(() => undefined)}
      className="shrink-0 rounded p-1 text-textFaint hover:bg-surfaceHover hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
    >
      <ExternalLinkIcon size={13} strokeWidth={1.5} aria-hidden="true" />
      <span className="sr-only">{title}</span>
    </button>
  );
}
