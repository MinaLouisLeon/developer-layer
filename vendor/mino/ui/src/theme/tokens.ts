/**
 * The design tokens.
 *
 * This is the ONLY file in the app allowed to contain a raw colour value.
 * Tailwind reads it (see tailwind.config.ts) so every class is a named token -
 * `bg-surface`, `text-textMuted` - and the xterm and CodeMirror themes, which
 * take colours as JavaScript strings rather than classes, read the same object
 * by name. Need a new colour? Add a named token here first.
 *
 * Two exceptions, both artwork rather than interface, and both loaded before
 * any JavaScript could hand them a token:
 *
 *   apps/ui/public/favicon.svg                    (browser tab)
 *   apps/desktop/src-tauri/icons/logo.svg         (app icon; every PNG and
 *                                                  the .ico derive from it)
 *
 * Each hard-codes `surface` and `accent`. Change either colour here and
 * change it in both, then re-run `node scripts/render-logo.mjs` and
 * `npx tauri icon`.
 */
export const colorTokens = {
  surface: "#0f141c",
  surfaceRaised: "#141a24",
  surfaceSunken: "#0a0e14",
  surfaceHover: "#1b2330",
  border: "#212a36",
  borderStrong: "#33404f",
  text: "#e6edf3",
  textMuted: "#a5b2c2",
  textFaint: "#7d8b9d",
  accent: "#5ed3a9",
  accentStrong: "#8ce8c6",
  accentMuted: "#1d3b33",
  danger: "#f87171",
  dangerMuted: "#3a1d1f",
  warning: "#fbbf24",
  warningMuted: "#3a2f14",
  info: "#7dd3fc",
  selection: "#264056",

  // Diff tones. Deliberately not `accent`/`danger`: an added line is not a
  // success and a removed one is not an error, and borrowing those would make
  // every diff look like a report card. The `*Line` pair is the row wash and
  // the plain pair is the gutter sign, which needs to carry on its own.
  diffAdded: "#7ee2a8",
  diffAddedLine: "#12291f",
  diffRemoved: "#f2a5a5",
  diffRemovedLine: "#2b1719",
} as const;

export type ColorToken = keyof typeof colorTokens;

export const fontStacks = {
  mono: [
    "JetBrains Mono",
    "Cascadia Mono",
    "SF Mono",
    "Menlo",
    "Consolas",
    "monospace",
  ],
  sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
} as const;
