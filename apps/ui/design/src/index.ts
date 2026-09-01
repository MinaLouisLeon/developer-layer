/**
 * Atlas design tokens, mirrored in TypeScript for canvas-rendered gauges.
 *
 * Gauges draw to Canvas rather than CSS: filter-based glow on always-visible
 * widgets burns GPU continuously across three displays, which is exactly the
 * cost a system monitor should not impose.
 */
export const atlas = {
  color: {
    void: "#05090b",
    surface: "#0c1317",
    raised: "#131e24",
    hairline: "#1d2c34",
    hairlineStrong: "#2b3f4a",
    accent: "#3fbfd4",
    accentDim: "#1d6c78",
    text: "#dce6ea",
    textMuted: "#7a8b94",
    textFaint: "#4c5b64",
    ok: "#5cb584",
    warn: "#e3a13f",
    crit: "#e06a6a",
  },
  font: {
    ui: '"Inter", ui-sans-serif, system-ui, sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, "Cascadia Code", monospace',
  },
  motion: {
    durationFast: 120,
    duration: 200,
    maxFps: 30,
  },
} as const;

/** Threshold colour for a 0..1 load value. State, not decoration. */
export function loadColor(value: number): string {
  if (value >= 0.9) return atlas.color.crit;
  if (value >= 0.7) return atlas.color.warn;
  return atlas.color.accent;
}

export type AtlasTokens = typeof atlas;
