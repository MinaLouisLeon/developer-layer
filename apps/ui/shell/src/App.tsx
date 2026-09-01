import { useEffect, useState } from "react";

import { atlas } from "@developer-layer/design";
import type { Config, Monitor } from "@developer-layer/shared";

import { getConfig, listMonitors } from "./ipc";

/**
 * Phase 00 shell. Proves the whole spine end to end: the Rust core owns the
 * types, ts-rs generates them, Tauri carries them across, React renders them.
 * The dock, slot editor and telemetry tile arrive in later phases.
 */
export function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [nextConfig, nextMonitors] = await Promise.all([
          getConfig(),
          listMonitors(),
        ]);
        if (cancelled) return;
        setConfig(nextConfig);
        setMonitors(nextMonitors);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="shell">
      <header className="shell__head">
        <span className="shell__mark" style={{ color: atlas.color.accent }}>
          ATLAS
        </span>
        <h1>Developer Layer</h1>
        <p className="shell__phase">Phase 00 — foundations</p>
      </header>

      {error ? (
        <p className="shell__error">Backend unreachable: {error}</p>
      ) : (
        <dl className="shell__facts">
          <div>
            <dt>Displays detected</dt>
            <dd>{monitors.length}</dd>
          </div>
          <div>
            <dt>Tile gap</dt>
            <dd>{config ? `${config.appearance.gap}px` : "—"}</dd>
          </div>
          <div>
            <dt>Command bar</dt>
            <dd>{config?.atlas.commandBarHotkey ?? "—"}</dd>
          </div>
          <div>
            <dt>Native taskbar</dt>
            <dd>
              {config?.general.replaceNativeTaskbar ? "replaced" : "intact"}
            </dd>
          </div>
        </dl>
      )}
    </main>
  );
}
