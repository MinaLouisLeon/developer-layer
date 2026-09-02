/**
 * User-facing start screen copy.
 *
 * Kept out of the hook for the same reason as the terminal's messages: the
 * strings stay shallow and a future translation pass has one file to reach
 * for rather than a call site to comb through.
 */
export const START_COPY = {
  heading: "Mino Workbench",
  tagline: "A Nushell terminal, a file tree and an editor over one transport.",

  /** Heads the one banner, which carries both picker and connect failures. */
  errorTitle: "Could not open that",
  /**
   * Shown when the folder picker is asked for outside the desktop app. The
   * picker is a Tauri capability, so in a browser tab there is no runtime to
   * answer it - saying so beats letting the missing IPC surface as a type
   * error the reader cannot act on.
   */
  pickerNeedsDesktop:
    "Opening a local folder needs the desktop app. This page is running in a browser, where the workbench can only reach a local agent daemon.",

  sshFormTitle: "Connect over SSH",
  back: "Back",
  connect: "Connect",
  connecting: "Connecting…",
  portInvalid: "The port must be a whole number between 1 and 65535.",
  /**
   * The app authenticates with a key file or an SSH agent and never asks for a
   * passphrase, so the hint has to say what to do with an encrypted key rather
   * than leaving the reader looking for a password box that does not exist.
   */
  identityHint:
    "Optional. Leave empty to use your SSH agent. An encrypted key must go through the agent — this app never asks for a passphrase.",
  /**
   * Set expectations before the failure rather than after it: an unknown host
   * is refused, and that is a deliberate choice worth stating up front.
   */
  hostKeyHint:
    "The host key is checked against your known_hosts file. An unrecognised host is refused rather than trusted on sight.",
} as const;
