import { describe, expect, it } from "vitest";

import { placeable } from "@/features/github/reviewGutter";
import { matches } from "@/features/github/hooks/useReviewThreads";

import { makeThread } from "../fake-github-rows";

/**
 * Which review threads may be drawn against a line, and which file a thread
 * belongs to.
 *
 * Both are one-line rules with consequences out of proportion to their size.
 * The first decides whether somebody's objection appears next to code it is
 * not about; the second decides whether it appears in the wrong file
 * entirely.
 */
describe("placing review threads", () => {
  it("counts the threads on each line", () => {
    const byLine = placeable([
      makeThread(1, { line: 4 }),
      makeThread(2, { line: 4 }),
      makeThread(3, { line: 9 }),
    ]);
    expect(byLine.get(4)).toBe(2);
    expect(byLine.get(9)).toBe(1);
  });

  it("never places an outdated thread", () => {
    // The rule the whole feature turns on. GitHub reported no line because
    // the diff this was written against is gone; drawing it anyway would put
    // it next to whatever now sits there.
    const byLine = placeable([
      makeThread(1, { line: null, outdated: true }),
      // Even one that somehow kept a line: outdated wins, because the line is
      // a line in a diff that no longer exists.
      makeThread(2, { line: 4, outdated: true }),
    ]);
    expect(byLine.size).toBe(0);
  });

  it("places nothing for a pull request with no threads", () => {
    expect(placeable([]).size).toBe(0);
  });
});

describe("matching a thread to the open file", () => {
  it("matches a repository-relative path against an absolute one", () => {
    expect(matches("/root/src/main.rs", "src/main.rs")).toBe(true);
    expect(matches("/root/repo/src/main.rs", "src/main.rs")).toBe(true);
  });

  it("matches a Windows path, which arrives with backslashes", () => {
    expect(matches("C:\\repo\\src\\main.rs", "src/main.rs")).toBe(true);
  });

  it("does not match a different file whose name ends the same way", () => {
    // The boundary check: without it, `main.rs` matches `domain.rs` and a
    // comment lands in a file nobody was looking at.
    expect(matches("/root/src/domain.rs", "main.rs")).toBe(false);
    expect(matches("/root/src/other.rs", "src/main.rs")).toBe(false);
  });

  it("matches a path that is already relative", () => {
    expect(matches("src/main.rs", "src/main.rs")).toBe(true);
  });
});
