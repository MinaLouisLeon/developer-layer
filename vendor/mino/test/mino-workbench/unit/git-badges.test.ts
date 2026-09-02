import { describe, expect, it } from "vitest";

import type { GitFileState } from "@/Types";
import { GIT_BADGES, badgeFor, isIgnored } from "@/features/git/badges";

import { makeGitEntry } from "../fake-transport";

const EVERY_STATE: GitFileState[] = [
  "unmodified",
  "modified",
  "added",
  "deleted",
  "renamed",
  "copied",
  "untracked",
  "ignored",
  "conflicted",
  "typeChanged",
];

describe("git badges", () => {
  it("has an answer for every state the Rust enum can produce", () => {
    // The generated union is the source of truth. A state added in Rust that
    // has no entry here would be a row that renders nothing and says nothing.
    for (const state of EVERY_STATE) {
      expect(GIT_BADGES).toHaveProperty(state);
    }
    expect(Object.keys(GIT_BADGES)).toHaveLength(EVERY_STATE.length);
  });

  it("draws no badge for a clean or ignored file", () => {
    expect(GIT_BADGES.unmodified).toBeNull();
    expect(GIT_BADGES.ignored).toBeNull();
  });

  it("prefers the unstaged side, and falls back to the staged one", () => {
    expect(
      badgeFor(makeGitEntry("/root/a", { index: "added", worktree: "modified" }))
        ?.letter,
    ).toBe("M");
    expect(
      badgeFor(
        makeGitEntry("/root/a", { index: "added", worktree: "unmodified" }),
      )?.letter,
    ).toBe("A");
    expect(
      badgeFor(
        makeGitEntry("/root/a", { index: "ignored", worktree: "ignored" }),
      ),
    ).toBeNull();
  });

  it("gives every badge a word as well as a letter", () => {
    for (const badge of Object.values(GIT_BADGES)) {
      if (!badge) continue;
      expect(badge.letter).toHaveLength(1);
      expect(badge.label.length).toBeGreaterThan(1);
    }
  });

  it("knows what ignored means", () => {
    expect(isIgnored("ignored")).toBe(true);
    expect(isIgnored("modified")).toBe(false);
  });
});
