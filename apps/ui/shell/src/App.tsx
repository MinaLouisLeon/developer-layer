import { useCallback, useEffect, useRef, useState } from "react";

import type { Config, Monitor, PassReport, SlotLayout } from "@developer-layer/shared";

import { listen } from "@tauri-apps/api/event";

import { Dock } from "./Dock";
import { LayoutEditor } from "./LayoutEditor";
import { Telemetry } from "./Telemetry";
import { getConfig, getLayout, listMonitors, runPass, syncDisplays } from "./ipc";

/**
 * The shell window: telemetry, the dock, and the slot layout for the current
 * displays, editable in place.
 *
 * Not the command bar — that is its own transparent window, `atlas.html`,
 * because it has to appear over whatever the user is looking at.
 */
export function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [layout, setLayout] = useState<SlotLayout | null>(null);
  const [pass, setPass] = useState<PassReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editor = useRef<HTMLDivElement>(null);

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

  // Atlas's "Edit the layout" raises this window and then sends this. The
  // editor is always on the page rather than behind a mode, so the useful
  // thing to do is put it in front of the reader — landing them at the top of
  // a scrolled page with no idea what happened would not be.
  useEffect(() => {
    const unlisten = listen("atlas:edit-layout", () => {
      editor.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  return (
    <main className="shell">
      <header className="shell__head">
        <span className="shell__mark">ATLAS</span>
        <h1>Developer Layer</h1>
        <p className="shell__phase">Phase 07 — Atlas</p>
      </header>

      {error ? <p className="shell__error">{error}</p> : null}

      <Telemetry />

      <Dock onError={setError} />

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

      <div ref={editor}>
        {layout && monitors.length > 0 ? (
          <LayoutEditor
            layout={layout}
            monitors={monitors}
            apps={config?.pinnedApps ?? []}
            onLayout={setLayout}
            onError={setError}
          />
        ) : null}
      </div>
    </main>
  );
}
