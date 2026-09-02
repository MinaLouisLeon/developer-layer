import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TerminalPane } from "@/features/terminal/components/TerminalPane";
import { MAX_TERMINALS } from "@/features/terminal/hooks/useTerminalStack";

import { createFakeTransport } from "../fake-transport";
import { renderConnected } from "../harness";

// jsdom cannot host a real terminal renderer; see ../xterm-mock.
vi.mock("@xterm/xterm", async () => (await import("../xterm-mock")).terminalModule());
vi.mock("@xterm/addon-fit", async () => (await import("../xterm-mock")).fitAddonModule());

/**
 * Splitting the terminal pane.
 *
 * Each split is a real shell on the target, so the things worth proving are
 * that a split opens exactly one more session and that closing one closes
 * exactly one - a leak here is an orphaned process, not a rendering bug.
 */
const shells = () => screen.getAllByLabelText("Interactive shell");

describe("terminal split", () => {
  it("starts with a single shell", async () => {
    const { client } = createFakeTransport();
    renderConnected(<TerminalPane />, client);

    await waitFor(() => expect(client.openPty).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(shells()).toHaveLength(1));
  });

  it("opens one more session per split", async () => {
    const { client } = createFakeTransport();
    renderConnected(<TerminalPane />, client);
    await waitFor(() => expect(client.openPty).toHaveBeenCalledTimes(1));

    await userEvent.click(await screen.findByRole("button", { name: "Split" }));

    await waitFor(() => expect(shells()).toHaveLength(2));
    expect(client.openPty).toHaveBeenCalledTimes(2);
  });

  it("closes exactly one session when a split is closed", async () => {
    const { client } = createFakeTransport();
    renderConnected(<TerminalPane />, client);
    await waitFor(() => expect(client.openPty).toHaveBeenCalledTimes(1));
    await userEvent.click(await screen.findByRole("button", { name: "Split" }));
    await waitFor(() => expect(shells()).toHaveLength(2));

    await userEvent.click(screen.getAllByRole("button", { name: "Close this terminal" })[1]);

    await waitFor(() => expect(shells()).toHaveLength(1));
    expect(client.closePty).toHaveBeenCalledTimes(1);
  });

  it("keeps the last terminal, which has no close control", async () => {
    const { client } = createFakeTransport();
    renderConnected(<TerminalPane />, client);
    await screen.findByRole("button", { name: "Split" });
    await waitFor(() => expect(shells()).toHaveLength(1));

    // Nothing to close with: the pane never goes empty.
    expect(screen.queryByRole("button", { name: "Close this terminal" })).toBeNull();
  });

  it("stops offering a split at the ceiling", async () => {
    const { client } = createFakeTransport();
    renderConnected(<TerminalPane />, client);
    await screen.findByRole("button", { name: "Split" });

    for (let opened = 1; opened < MAX_TERMINALS; opened += 1) {
      await userEvent.click(screen.getByRole("button", { name: "Split" }));
      await waitFor(() => expect(shells()).toHaveLength(opened + 1));
    }

    expect(screen.getByRole("button", { name: "Split" })).toBeDisabled();
    expect(shells()).toHaveLength(MAX_TERMINALS);
  });

  it("puts a resize handle between columns, and none before the first", async () => {
    const { client } = createFakeTransport();
    renderConnected(<TerminalPane />, client);
    await screen.findByRole("button", { name: "Split" });

    // One terminal, so nothing to resize against.
    expect(screen.queryAllByRole("separator")).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Split" }));
    await waitFor(() => expect(shells()).toHaveLength(2));
    expect(screen.getAllByRole("separator")).toHaveLength(1);
  });

  it("resizes from the keyboard, so the split is not mouse-only", async () => {
    const { client } = createFakeTransport();
    renderConnected(<TerminalPane />, client);
    await screen.findByRole("button", { name: "Split" });
    await userEvent.click(screen.getByRole("button", { name: "Split" }));
    await waitFor(() => expect(shells()).toHaveLength(2));

    const columnWidth = () =>
      (shells()[0].closest("[style]") as HTMLElement).style.flexBasis;
    const before = columnWidth();

    const handle = screen.getByRole("separator");
    handle.focus();
    await userEvent.keyboard("{ArrowLeft}");

    await waitFor(() => expect(columnWidth()).not.toBe(before));
  });
});
