import { describe, expect, it } from "vitest";

import type { SearchHit } from "@/Types";
import { splitPath } from "@/features/search/splitPath";

import { makeEntry } from "../fake-transport";

function hit(relativePath: string, matchIndices: number[]): SearchHit {
  return {
    entry: makeEntry(`/root/${relativePath}`),
    relativePath,
    score: 1,
    matchIndices,
  };
}

/**
 * Rust matches against the whole relative path and indexes into it; the row
 * shows the filename and its folder as two pieces. These are the cases where
 * getting the re-basing wrong would highlight the wrong characters.
 */
describe("splitPath", () => {
  it("keeps a bare filename whole", () => {
    // "readme.md", matching "rd"
    expect(splitPath(hit("readme.md", [0, 4]))).toEqual({
      directory: "",
      name: "readme.md",
      directoryMatches: [],
      nameMatches: [0, 4],
    });
  });

  it("re-bases the filename's matches onto the filename", () => {
    // "src/main.rs", matching "main" at 4..7 - which is 0..3 of the name.
    expect(splitPath(hit("src/main.rs", [4, 5, 6, 7]))).toEqual({
      directory: "src",
      name: "main.rs",
      directoryMatches: [],
      nameMatches: [0, 1, 2, 3],
    });
  });

  it("splits matches that land on both sides", () => {
    // "src/main.rs", matching "sm": `s` in the folder, `m` in the name.
    expect(splitPath(hit("src/main.rs", [0, 4]))).toEqual({
      directory: "src",
      name: "main.rs",
      directoryMatches: [0],
      nameMatches: [0],
    });
  });

  it("drops a match on the separator, which belongs to neither half", () => {
    // "src/main.rs", matching "s/m" - index 3 is the slash itself.
    expect(splitPath(hit("src/main.rs", [0, 3, 4]))).toEqual({
      directory: "src",
      name: "main.rs",
      directoryMatches: [0],
      nameMatches: [0],
    });
  });

  it("keeps the whole folder path, however deep", () => {
    // Index 22 is the last separator, so the `T` of `TreeRow.tsx` is at 23.
    const split = splitPath(hit("src/features/file-tree/TreeRow.tsx", [23]));
    expect(split.directory).toBe("src/features/file-tree");
    expect(split.name).toBe("TreeRow.tsx");
    expect(split.nameMatches).toEqual([0]);
  });
});
