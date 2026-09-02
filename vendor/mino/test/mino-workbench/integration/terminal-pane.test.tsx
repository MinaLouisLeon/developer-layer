import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TerminalPane } from "@/features/terminal/components/TerminalPane";

import { createFakeTransport } from "../fake-transport";
import { NU_MISSING_PROBE } from "../fake-shell";
import { renderConnected } from "../harness";

/**
 * xterm needs a real renderer, so it is replaced here. The seam under test is
 * the transport wiring: what the pane opens, writes, resizes and closes.
 */
const xterm = vi.hoisted(() => {
  const instances: Array<Record<string, unknown>> = [];
  return { instances };
});

vi.mock("@xterm/xterm", () => {
  class Terminal {
    cols = 80;
    rows = 24;
    dataHandler: ((chunk: string) => void) | null = null;
    written: string[] = [];
    constructor() {
      xterm.instances.push(this as unknown as Record<string, unknown>);
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
    onResize() {
      return { dispose: () => undefined };
    }
    dispose() {}
  }
  return { Terminal };
});

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));

describe("TerminalPane", () => {
  it("opens a session rooted at the connection and closes it on unmount", async () => {
    const { client } = createFakeTransport();
    const { unmount } = renderConnected(<TerminalPane />, client);

    await waitFor(() =>
      expect(client.openPty).toHaveBeenCalledWith({
        cwd: "/root",
        size: { cols: 80, rows: 24 },
      }),
    );

    unmount();
    await waitFor(() => expect(client.closePty).toHaveBeenCalledWith("session-1"));
  });

  it("sends what the user types to the pty", async () => {
    const { client } = createFakeTransport();
    renderConnected(<TerminalPane />, client);

    await waitFor(() => expect(client.onPtyEvent).toHaveBeenCalled());
    const terminal = xterm.instances.at(-1) as {
      dataHandler: ((chunk: string) => void) | null;
    };
    terminal.dataHandler?.("ls\r");

    await waitFor(() =>
      expect(client.writePty).toHaveBeenCalledWith("session-1", "ls\r"),
    );
  });

  it("writes pty output into the terminal", async () => {
    const { client, emit } = createFakeTransport();
    renderConnected(<TerminalPane />, client);

    await waitFor(() => expect(client.onPtyEvent).toHaveBeenCalled());
    emit({ type: "output", data: "hello" });

    const terminal = xterm.instances.at(-1) as { written: string[] };
    await waitFor(() => expect(terminal.written).toContain("hello"));
  });

  it("explains the fallback shell when nu is missing", async () => {
    const { client } = createFakeTransport({
      shellProbe: NU_MISSING_PROBE,
      session: { program: "/bin/zsh", shell: "fallback", fellBack: true },
    });
    renderConnected(<TerminalPane />, client);

    expect(await screen.findByText("Running without Nushell")).toBeInTheDocument();
    expect(
      screen.getByText(/this terminal is running zsh instead/),
    ).toBeInTheDocument();
  });

  it("reports the shell exiting instead of leaving a blank pane", async () => {
    const { client, emit } = createFakeTransport();
    renderConnected(<TerminalPane />, client);

    await waitFor(() => expect(client.onPtyEvent).toHaveBeenCalled());
    emit({ type: "exit", data: { code: 0, success: true } });

    expect(await screen.findByText("The shell exited")).toBeInTheDocument();
  });
});
