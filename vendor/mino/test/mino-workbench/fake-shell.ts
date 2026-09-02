import type { ShellProbe } from "@/Types";

/**
 * The two shell probes worth testing against, kept beside the fake transport
 * rather than in it so neither file grows past the project's ceiling.
 *
 * Whether `nu` is present changes what the terminal spawns and what the tree
 * falls back to, so both answers need to be easy to ask for.
 */
export const NU_MISSING_PROBE: ShellProbe = {
  nuAvailable: false,
  nuPath: null,
  fallbackProgram: "/bin/zsh",
  fallbackLabel: "zsh",
};

export const NU_PRESENT_PROBE: ShellProbe = {
  nuAvailable: true,
  nuPath: "/usr/bin/nu",
  fallbackProgram: "/bin/zsh",
  fallbackLabel: "zsh",
};
