import { useCallback, useEffect, useState } from "react";

import type { Config, Monitor, PassReport, SlotLayout } from "@developer-layer/shared";

import { LayoutEditor } from "./LayoutEditor";
import { getConfig, getLayout, listMonitors, runPass, syncDisplays } from "./ipc";

/**
 * Phase 02 shell: the slot layout for the current displays, editable in place.
 *
 * The dock, telemetry tile and command bar arrive in later phases.
 */
export function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [layout, setLayout] = useState<SlotLayout | null>(null);
  const [pass, setPass] = useState<PassReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [nextConfig, nextMonitors, nextLayout] = await Promise.all([
      getConfig(),
      listMonitors(),
      getLayout(),
    ]);
    setConfig(nextConfig);
    setMonitors(nextMonitors);
    setLayout(nextLayout);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load().catch((e: unknown) => {
      if (!cancelled) setError(String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  return (
    <main className="shell">
      <header className="shell__head">
        <span className="shell__mark">ATLAS</span>
        <h1>Developer Layer</h1>
        <p className="shell__phase">Phase 02 — layouts</p>
      </header>

      {error ? <p className="shell__error">{error}</p> : null}

      <dl className="shell__facts">
        <div>
          <dt>Displays</dt>
          <dd>{monitors.length}</dd>
        </div>
        <div>
          <dt>Slots</dt>
          <dd>{layout?.slots.length ?? "—"}</dd>
        </div>
        <div>
          <dt>Tile gap</dt>
          <dd>{config ? `${config.appearance.gap}px` : "—"}</dd>
        </div>
        <div>
          <dt>Windows tiled</dt>
          <dd>{pass ? pass.tiled : "—"}</dd>
        </div>
        <div>
          <dt>Operations</dt>
          <dd>{pass ? pass.operations : "—"}</dd>
        </div>
        <div>
          <dt>Refused</dt>
          <dd>{pass ? pass.failures.length : "—"}</dd>
        </div>
      </dl>

      <div className="shell__actions">
        <button
          type="button"
          onClick={() => {
            void runPass().then(setPass).catch((e: unknown) => setError(String(e)));
          }}
        >
          Run pass
        </button>
        <button
          type="button"
          onClick={() => {
            void syncDisplays()
              .then(() => load())
              .catch((e: unknown) => setError(String(e)));
          }}
        >
          Re-detect displays
        </button>
      </div>

      {layout && monitors.length > 0 ? (
        <LayoutEditor
          layout={layout}
          monitors={monitors}
          apps={config?.pinnedApps ?? []}
          onLayout={setLayout}
          onError={setError}
        />
      ) : null}
    </main>
  );
}
