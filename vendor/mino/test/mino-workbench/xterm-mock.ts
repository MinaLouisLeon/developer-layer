/**
 * A stand-in for xterm.
 *
 * xterm wants a real renderer - it reaches for `matchMedia` and a canvas the
 * moment `open` is called - and jsdom has neither. None of that is the seam
 * under test anyway: what matters is the transport wiring, so the terminal is
 * replaced by something that records what it was asked to do.
 *
 * Shared by every suite that renders a terminal, so the two cannot drift into
 * mocking it differently.
 */
export interface MockTerminal {
  cols: number;
  rows: number;
  dataHandler: ((chunk: string) => void) | null;
  resizeHandler: ((size: { cols: number; rows: number }) => void) | null;
  written: string[];
  disposed: boolean;
}

/** Every terminal constructed since the module was loaded, in order. */
export const terminals: MockTerminal[] = [];

export function terminalModule() {
  class Terminal implements MockTerminal {
    cols = 80;
    rows = 24;
    dataHandler: ((chunk: string) => void) | null = null;
    resizeHandler: ((size: { cols: number; rows: number }) => void) | null = null;
    written: string[] = [];
    disposed = false;

    constructor() {
      terminals.push(this);
    }
    loadAddon() {}
    open() {}
    write(chunk: string) {
      this.written.push(chunk);
    }
    onData(handler: (chunk: string) => void) {
      this.dataHandler = handler;
      return { dispose: () => (this.dataHandler = null) };
    }
    onResize(handler: (size: { cols: number; rows: number }) => void) {
      this.resizeHandler = handler;
      return { dispose: () => (this.resizeHandler = null) };
    }
    dispose() {
      this.disposed = true;
    }
  }
  return { Terminal };
}

export function fitAddonModule() {
  return {
    FitAddon: class {
      fit() {}
    },
  };
}
