import { describe, expect, it } from "vitest";

import { groupEntries, isUntracked } from "@/features/source-control/grouping";

import { makeGitEntry } from "../fake-git-rows";

/** The rows of one group, by repository-relative path. */
function paths(entries: Parameters<typeof groupEntries>[0], id: string) {
  return (
    groupEntries(entries)
      .find((group) => group.id === id)
      ?.rows.map((row) => row.entry.relativePath) ?? []
  );
}

describe("grouping the working tree", () => {
  it("puts a staged file in Staged and an unstaged one in Changes", () => {
    const entries = [
      makeGitEntry("/root/staged.rs", {
        index: "added",
        worktree: "unmodified",
      }),
      makeGitEntry("/root/edited.rs", { worktree: "modified" }),
    ];
    expect(paths(entries, "staged")).toEqual(["staged.rs"]);
    expect(paths(entries, "changes")).toEqual(["edited.rs"]);
  });

  it("puts a file that is staged and then modified again in both", () => {
    // The condition the two-state shape exists for. One group would have to
    // pick a side and lose the other.
    const entries = [
      makeGitEntry("/root/both.rs", { index: "modified", worktree: "modified" }),
    ];
    expect(paths(entries, "staged")).toEqual(["both.rs"]);
    expect(paths(entries, "changes")).toEqual(["both.rs"]);
  });

  it("treats an untracked file as a change, never as staged", () => {
    // Git reports `untracked` on both sides. A file git has never seen is not
    // staged, and offering to unstage it would be nonsense.
    const entries = [
      makeGitEntry("/root/notes.txt", {
        index: "untracked",
        worktree: "untracked",
      }),
    ];
    expect(paths(entries, "staged")).toEqual([]);
    expect(paths(entries, "changes")).toEqual(["notes.txt"]);
    expect(isUntracked(entries[0])).toBe(true);
  });

  it("shows a conflicted file as a change to resolve", () => {
    const entries = [
      makeGitEntry("/root/merge.rs", {
        index: "conflicted",
        worktree: "conflicted",
      }),
    ];
    expect(paths(entries, "changes")).toEqual(["merge.rs"]);
  });

  it("never lists an ignored file", () => {
    // The tree dims them. A panel offering to stage `node_modules` would be
    // offering a mistake.
    const entries = [
      makeGitEntry("/root/build.log", {
        index: "ignored",
        worktree: "ignored",
      }),
    ];
    expect(paths(entries, "staged")).toEqual([]);
    expect(paths(entries, "changes")).toEqual([]);
  });

  it("orders rows by path, so a refresh cannot move one under the cursor", () => {
    // Not cosmetic: these rows carry a destructive control, and a list that
    // reshuffles is a list where a click lands on the wrong file.
    const entries = [
      makeGitEntry("/root/z.rs", { worktree: "modified" }),
      makeGitEntry("/root/a.rs", { worktree: "modified" }),
      makeGitEntry("/root/src/m.rs", { worktree: "modified" }),
    ];
    expect(paths(entries, "changes")).toEqual(["a.rs", "src/m.rs", "z.rs"]);
  });

  it("splits each row into a filename and its folder", () => {
    const [row] = groupEntries([
      makeGitEntry("/root/src/deep/main.rs", { worktree: "modified" }),
    ]).find((group) => group.id === "changes")!.rows;

    expect(row.name).toBe("main.rs");
    expect(row.directory).toBe("src/deep");
    // The state that put it in this group, not the other side.
    expect(row.state).toBe("modified");
  });
});
