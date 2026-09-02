/**
 * "3 minutes ago", for the history list.
 *
 * Uses `Intl.RelativeTimeFormat`, so the wording is the platform's rather than
 * a table of English strings in this repo - which is the one piece of copy
 * here that a future translation pass gets for free.
 */
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function relativeTime(timestampMs: number, now = Date.now()): string {
  const elapsed = timestampMs - now;
  for (const [unit, size] of UNITS) {
    if (Math.abs(elapsed) >= size) {
      return formatter.format(Math.round(elapsed / size), unit);
    }
  }
  // Anything under a minute. "now" reads better than "0 seconds ago", and a
  // commit that new is almost always the one just made.
  return formatter.format(0, "second");
}

/** The full timestamp, for the tooltip behind the relative one. */
export function absoluteTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleString();
}
