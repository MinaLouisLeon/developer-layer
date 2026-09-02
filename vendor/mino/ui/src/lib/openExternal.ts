import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Hands a URL to the operating system's browser.
 *
 * The only way an address leaves this window, and it deliberately does not
 * involve the window. A page that can navigate itself to an arbitrary address
 * is a page somebody else can steer - and every URL this app opens came from
 * `gh`, which is to say from GitHub, which is to say from outside. So the
 * webview never follows one: the URL goes to the desktop opener, which hands
 * it to a browser, and the workbench stays where it was.
 *
 * Two guards, at two different levels:
 *
 * - **Here.** Only `https://github.com` addresses are passed on. This is the
 *   check that produces a sentence, and it is the one that catches a URL that
 *   is odd rather than hostile.
 * - **In `capabilities/default.json`.** `opener:allow-open-url` is scoped to
 *   `https://github.com/*`, so the runtime refuses anything else whatever this
 *   file does. That is the check that matters, because it holds even if this
 *   one is wrong.
 *
 * In a plain browser build there is no opener, so this rejects rather than
 * navigating. The GitHub view is not reachable there anyway - the agent
 * transport has no GitHub surface yet - and a rejection is the honest answer.
 */
const ALLOWED_ORIGIN = "https://github.com";

export function isGitHubUrl(url: string): boolean {
  try {
    return new URL(url).origin === ALLOWED_ORIGIN;
  } catch {
    return false;
  }
}

export async function openExternal(url: string): Promise<void> {
  if (!isGitHubUrl(url)) {
    throw new Error(`${url} is not a github.com address, so it was not opened.`);
  }
  await openUrl(url);
}
