import { describe, expect, it } from "vitest";

import type { TransportError } from "@/Types";
import {
  describeFailure,
  isTransportError,
  toTransportError,
  transportErrorMessage,
} from "@/lib/transportError";

describe("transport error normalisation", () => {
  it("recognises a typed error", () => {
    expect(isTransportError({ kind: "notConnected" })).toBe(true);
    expect(isTransportError(new Error("boom"))).toBe(false);
  });

  it("wraps anything else as a protocol error", () => {
    expect(toTransportError(new Error("boom"))).toEqual({
      kind: "protocol",
      detail: { message: "boom" },
    });
  });
});

describe("transport error copy", () => {
  it("explains the viewer's size ceiling with real sizes", () => {
    const error: TransportError = {
      kind: "tooLarge",
      detail: { path: "/root/big.log", size: 5 * 1024 * 1024, limit: 2 * 1024 * 1024 },
    };
    expect(transportErrorMessage(error)).toBe(
      "This file is 5 MB and the viewer stops at 2 MB. Open it in an external editor instead.",
    );
  });

  it("explains the binary guard", () => {
    const error: TransportError = {
      kind: "binaryFile",
      detail: { path: "/root/app.bin", size: 1024 },
    };
    expect(transportErrorMessage(error)).toBe(
      "This looks like a binary file (1 KB), so it is not shown here.",
    );
  });

  it("names the transport that is not built yet", () => {
    const error: TransportError = {
      kind: "unimplemented",
      detail: { feature: "connect", transport: "ssh" },
    };
    expect(transportErrorMessage(error)).toBe(
      "SSH connections are not available in this build yet.",
    );
  });

  it("keeps the guard messages reachable from an unknown throw", () => {
    expect(describeFailure({ kind: "notConnected" })).toBe(
      "No folder is open yet. Choose a folder to get started.",
    );
  });
});
