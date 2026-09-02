import { describe, expect, it } from "vitest";

import type { DirectoryMap } from "@/features/file-tree/types";
import { flattenTree, withExpanded } from "@/features/file-tree/tree";

import { makeEntry } from "../fake-transport";

const DIRECTORIES: DirectoryMap = {
  "/root": {
    status: "loaded",
    error: null,
    entries: [
      makeEntry("/root/src", { kind: "directory" }),
      makeEntry("/root/readme.md"),
    ],
  },
  "/root/src": {
    status: "loaded",
    error: null,
    entries: [makeEntry("/root/src/main.rs")],
  },
};

describe("flattenTree", () => {
  it("returns nothing without a root", () => {
    expect(flattenTree(null, DIRECTORIES, new Set())).toEqual([]);
  });

  it("shows one level until a folder is expanded", () => {
    const rows = flattenTree("/root", DIRECTORIES, new Set());
    expect(rows.map((row) => row.entry.path)).toEqual([
      "/root/src",
      "/root/readme.md",
    ]);
  });

  it("splices expanded children in at the next depth", () => {
    const rows = flattenTree("/root", DIRECTORIES, new Set(["/root/src"]));
    expect(rows.map((row) => row.entry.path)).toEqual([
      "/root/src",
      "/root/src/main.rs",
      "/root/readme.md",
    ]);
    expect(rows[1]?.depth).toBe(1);
  });

  it("carries each level's own load state onto its row", () => {
    const failing: DirectoryMap = {
      ...DIRECTORIES,
      "/root/src": { status: "error", error: "Denied", entries: null },
    };
    const rows = flattenTree("/root", failing, new Set(["/root/src"]));
    expect(rows[0]).toMatchObject({ status: "error", error: "Denied" });
  });

  it("stops at a directory that links back to itself", () => {
    const looping: DirectoryMap = {
      "/root": {
        status: "loaded",
        error: null,
        entries: [makeEntry("/root", { kind: "directory", name: "root" })],
      },
    };
    expect(flattenTree("/root", looping, new Set(["/root"]))).toHaveLength(1);
  });
});

describe("withExpanded", () => {
  it("adds and removes without mutating the original", () => {
    const original = new Set(["/a"]);
    expect([...withExpanded(original, "/b", true)]).toEqual(["/a", "/b"]);
    expect([...withExpanded(original, "/a", false)]).toEqual([]);
    expect([...original]).toEqual(["/a"]);
  });
});
