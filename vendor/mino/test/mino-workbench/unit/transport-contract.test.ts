import { describe, expect, it } from "vitest";

import type { TransportClient, TransportError } from "@/Types";
import {
  GIT_BRANCH_COMMANDS,
  GIT_COMMANDS,
  GIT_HISTORY_COMMANDS,
  GIT_REMOTE_COMMANDS,
  GIT_STASH_COMMANDS,
  GITHUB_COMMANDS,
  TRANSPORT_COMMANDS,
} from "@/Types";
import { AgentTransport } from "@/transport";

import { createFakeTransport } from "../fake-transport";
import { ALL_GIT_COMMANDS, callGit, GIT_METHODS } from "../git-contract";
import { callGitHub, GITHUB_METHODS } from "../github-contract";

/** The callable half of the interface: everything but the three fields. */
type TransportMethod = Exclude<
  keyof TransportClient,
  "kind" | "git" | "github"
>;

/** Every method on the interface, in the order the Rust trait declares them. */
const METHODS: TransportMethod[] = [
  "connect",
  "disconnect",
  "listDir",
  "stat",
  "searchFiles",
  "readFile",
  "writeFile",
  "openPty",
  "writePty",
  "resizePty",
  "closePty",
  "runStructured",
  "probeShell",
  "onPtyEvent",
];

describe("transport client contract", () => {
  it("the fake implements every method the panes may call", () => {
    const { client } = createFakeTransport();
    for (const method of METHODS) {
      expect(typeof client[method]).toBe("function");
    }
    for (const method of GIT_METHODS) {
      expect(typeof client.git[method]).toBe("function");
    }
    for (const method of GITHUB_METHODS) {
      expect(typeof client.github[method]).toBe("function");
    }
  });

  it("names one Tauri command per transport method", () => {
    expect(Object.keys(TRANSPORT_COMMANDS)).toHaveLength(METHODS.length - 1);
    expect(TRANSPORT_COMMANDS.listDir).toBe("list_dir");
    expect(TRANSPORT_COMMANDS.runStructured).toBe("run_structured");
  });

  it("names one Tauri command per git method", () => {
    expect(Object.keys(ALL_GIT_COMMANDS)).toHaveLength(GIT_METHODS.length);
    expect(GIT_COMMANDS.repository).toBe("git_repository");
    expect(GIT_HISTORY_COMMANDS.blame).toBe("git_blame");
    expect(GIT_BRANCH_COMMANDS.checkout).toBe("git_checkout");
    expect(GIT_STASH_COMMANDS.stashDrop).toBe("git_stash_drop");
    expect(GIT_REMOTE_COMMANDS.push).toBe("git_push");
    expect(GIT_REMOTE_COMMANDS.resolve).toBe("git_resolve");
  });

  // Two commands for five features, because the surface is two trait methods
  // for five features: the caller picks a `GitHubQuery` variant and Rust owns
  // the program text behind it.
  it("names one Tauri command per GitHub method", () => {
    expect(Object.keys(GITHUB_COMMANDS)).toHaveLength(GITHUB_METHODS.length);
    expect(GITHUB_COMMANDS.probe).toBe("github_probe");
    expect(GITHUB_COMMANDS.query).toBe("github_query");
  });
});

describe("agent transport", () => {
  const agent = new AgentTransport("ws://127.0.0.1:8731/ws");

  it("reports the endpoint it would dial", () => {
    expect(agent.endpoint).toBe("ws://127.0.0.1:8731/ws");
    expect(agent.kind).toBe("remoteAgent");
  });

  it.each(METHODS)("rejects %s with a typed unimplemented error", async (method) => {
    const call = agent[method] as (...args: unknown[]) => Promise<unknown>;
    // `onPtyEvent` is the one method with no Tauri command behind it, so it
    // names itself rather than being looked up in the command map.
    const feature =
      method === "onPtyEvent" ? "on_pty_event" : TRANSPORT_COMMANDS[method];
    await expect(call.call(agent, "x", "y")).rejects.toEqual({
      kind: "unimplemented",
      detail: { feature, transport: "remoteAgent" },
    } satisfies TransportError);
  });

  // Note what is asserted here: `repository` rejects rather than resolving
  // `null`. "No agent protocol yet" and "not a repository" are different
  // facts, and answering the first with the second would hide it.
  it.each(GIT_METHODS)("rejects git.%s with a typed unimplemented error", async (method) => {
    await expect(callGit(agent.git, method)).rejects.toEqual({
      kind: "unimplemented",
      detail: { feature: ALL_GIT_COMMANDS[method], transport: "remoteAgent" },
    } satisfies TransportError);
  });

  // The same trap, one notch sharper. `probe` rejects rather than resolving an
  // `unsupported` probe: "no agent protocol yet" and "this folder has no
  // GitHub repository" render identically - one quiet sentence - and only one
  // of them is a bug waiting to be finished.
  it.each(GITHUB_METHODS)(
    "rejects github.%s with a typed unimplemented error",
    async (method) => {
      await expect(callGitHub(agent.github, method)).rejects.toEqual({
        kind: "unimplemented",
        detail: { feature: GITHUB_COMMANDS[method], transport: "remoteAgent" },
      } satisfies TransportError);
    },
  );
});
