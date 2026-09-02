import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import type { PtySize } from "@/Types";
import {
  TERMINAL_FONT_SIZE,
  TERMINAL_SCROLLBACK,
  terminalFontFamily,
  terminalTheme,
} from "@/theme/terminalTheme";

import type { XtermHandle } from "../types";

/**
 * Owns the xterm instance and its fit addon. Nothing here knows about the
 * transport; the session hook wires the two together.
 */
export function useXterm(): XtermHandle & {
  terminal: RefObject<Terminal | null>;
} {
  const container = useRef<HTMLDivElement | null>(null);
  const terminal = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const parent = container.current;
    if (!parent) return;

    const term = new Terminal({
      fontFamily: terminalFontFamily,
      fontSize: TERMINAL_FONT_SIZE,
      scrollback: TERMINAL_SCROLLBACK,
      theme: terminalTheme,
      cursorBlink: true,
      convertEol: false,
      allowProposedApi: false,
    });
    const addon = new FitAddon();
    term.loadAddon(addon);
    term.open(parent);

    terminal.current = term;
    fitAddon.current = addon;
    setReady(true);

    return () => {
      setReady(false);
      terminal.current = null;
      fitAddon.current = null;
      term.dispose();
    };
  }, []);

  const fit = useCallback((): PtySize => {
    const term = terminal.current;
    // A zero-sized container (a collapsed pane) would otherwise ask for a 0x0
    // grid, which some platforms treat as a fatal ioctl.
    if (!term) return { cols: 80, rows: 24 };
    fitAddon.current?.fit();
    return { cols: Math.max(term.cols, 1), rows: Math.max(term.rows, 1) };
  }, []);

  return { container, terminal, fit, ready };
}
