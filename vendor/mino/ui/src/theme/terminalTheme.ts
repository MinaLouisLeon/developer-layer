import type { ITheme } from "@xterm/xterm";

import { colorTokens, fontStacks } from "./tokens";

/**
 * xterm takes colours as strings rather than classes, so it reads the same
 * tokens Tailwind does. No literal colour values here.
 */
export const terminalTheme: ITheme = {
  background: colorTokens.surfaceSunken,
  foreground: colorTokens.text,
  cursor: colorTokens.accent,
  cursorAccent: colorTokens.surfaceSunken,
  selectionBackground: colorTokens.selection,
  black: colorTokens.surfaceSunken,
  red: colorTokens.danger,
  green: colorTokens.accent,
  yellow: colorTokens.warning,
  blue: colorTokens.info,
  magenta: colorTokens.accentStrong,
  cyan: colorTokens.info,
  white: colorTokens.text,
  brightBlack: colorTokens.textFaint,
  brightRed: colorTokens.danger,
  brightGreen: colorTokens.accentStrong,
  brightYellow: colorTokens.warning,
  brightBlue: colorTokens.info,
  brightMagenta: colorTokens.accentStrong,
  brightCyan: colorTokens.info,
  brightWhite: colorTokens.text,
};

export const terminalFontFamily = fontStacks.mono.join(", ");
export const TERMINAL_FONT_SIZE = 13;
/** Kept in the terminal buffer. Roughly a session's worth of output. */
export const TERMINAL_SCROLLBACK = 5000;
