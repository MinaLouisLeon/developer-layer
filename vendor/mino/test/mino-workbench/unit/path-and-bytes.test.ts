import { describe, expect, it } from "vitest";

import { formatBytes } from "@/lib/bytes";
import { basename, splitSegments } from "@/lib/path";

describe("path helpers", () => {
  it("reads a basename on both separators", () => {
    expect(basename("/root/src/main.rs")).toBe("main.rs");
    expect(basename("C:\\code\\app\\main.rs")).toBe("main.rs");
    expect(basename("/root/src/")).toBe("src");
  });

  it("splits breadcrumb segments, dropping empties", () => {
    expect(splitSegments("/root//src/")).toEqual(["root", "src"]);
    expect(splitSegments("C:\\code\\app")).toEqual(["C:", "code", "app"]);
  });
});

describe("formatBytes", () => {
  it("formats each unit the copy can show", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2 MB");
  });

  it("says so rather than printing nonsense", () => {
    expect(formatBytes(Number.NaN)).toBe("unknown size");
    expect(formatBytes(-1)).toBe("unknown size");
  });
});
