/**
 * User-facing terminal copy.
 *
 * Kept out of the component so the strings stay shallow and consistent - and
 * so a future translation pass has one file to reach for rather than a JSX
 * tree to comb through.
 */
export const TERMINAL_COPY = {
  fallbackTitle: "Running without Nushell",
  fallback: (shell: string) =>
    `Nushell (nu) was not found on your PATH, so this terminal is running ${shell} instead. The tree falls back to a plain listing. Install Nushell and reopen the folder to get structured output.`,
  exitTitle: "The shell exited",
  exit: (code: number | null) =>
    code === null
      ? "The shell exited. Reopen the folder to start a new session."
      : `The shell exited with code ${code}. Reopen the folder to start a new session.`,
  errorTitle: "Terminal problem",
  terminalLabel: "Interactive shell",

  starting: "Starting…",
  split: "Split",
  splitHint: "Open another shell beside this one",
  /** Shown on the disabled control, so the limit explains itself. */
  splitFull: "Four shells is the most this pane will hold",
  closeTerminal: "Close this terminal",
  splitHandle: "Resize terminals",
} as const;
