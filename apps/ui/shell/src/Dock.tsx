import { useCallback, useEffect, useState } from "react";

import type { DockEntry } from "@developer-layer/shared";

import {
  appIcon,
  clickDockEntry,
  dockEntries,
  refreshPinnedApps,
  windowThumbnail,
} from "./ipc";

interface Props {
  onError: (message: string) => void;
}

/**
 * The dock — a taskbar replacement.
 *
 * What a click means is decided in Rust, not here: the rules depend on how many
 * windows an entry has, which are minimised and which holds the foreground, and
 * they are tested there rather than discovered by clicking around. This
 * component reports the click and re-reads state.
 */
export function Dock({ onError }: Props) {
  const [entries, setEntries] = useState<DockEntry[]>([]);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [hovered, setHovered] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void dockEntries()
      .then(setEntries)
      .catch((e: unknown) => onError(String(e)));
  }, [onError]);

  useEffect(() => {
    refresh();
    // Polled rather than pushed for now: the WinEvent hook thread already
    // coalesces window events, and wiring its output through to the frontend
    // is the last piece. One second is imperceptible for running state.
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;

    for (const entry of entries) {
      const id = entry.app;
      if (!id || icons[id] !== undefined) continue;

      void appIcon(id)
        .then((url) => {
          if (cancelled || !url) return;
          setIcons((current) => ({ ...current, [id]: url }));
        })
        // A missing icon renders as an initial and the entry still works.
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [entries, icons]);

  const click = useCallback(
    (entry: DockEntry) => {
      void clickDockEntry(entry.app)
        .then(refresh)
        .catch((e: unknown) => onError(String(e)));
    },
    [refresh, onError],
  );

  if (entries.length === 0) {
    return (
      <section className="dock dock--empty">
        <span className="dock__hint">No applications pinned yet.</span>
        <button
          type="button"
          onClick={() => {
            void refreshPinnedApps()
              .then(refresh)
              .catch((e: unknown) => onError(String(e)));
          }}
        >
          Find installed apps
        </button>
      </section>
    );
  }

  return (
    <section className="dock">
      <ul className="dock__items">
        {entries.map((entry) => (
          <li
            key={entry.app ?? entry.displayName}
            onMouseEnter={() => setHovered(entry.app ?? entry.displayName)}
            onMouseLeave={() => setHovered(null)}
          >
            <button
              type="button"
              className={[
                "dock__app",
                entry.active ? "dock__app--active" : "",
                entry.windows.length > 0 ? "dock__app--running" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              title={entry.displayName}
              onClick={() => click(entry)}
            >
              {entry.app && icons[entry.app] ? (
                <img className="dock__icon" src={icons[entry.app]} alt="" />
              ) : (
                <span className="dock__initial" aria-hidden="true">
                  {entry.displayName.charAt(0)}
                </span>
              )}

              <span className="dock__name">{entry.displayName}</span>

              {/* One pip per window, up to four: past that the count is what
                  matters, not the exact number. */}
              {entry.windows.length > 0 ? (
                <span className="dock__pips" aria-hidden="true">
                  {Array.from({ length: Math.min(entry.windows.length, 4) }).map(
                    (_, i) => (
                      <span key={i} className="dock__pip" />
                    ),
                  )}
                </span>
              ) : null}
            </button>

            {hovered === (entry.app ?? entry.displayName) &&
            entry.windows.length > 0 ? (
              <Previews entry={entry} />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Hover previews.
 *
 * Captured on hover rather than continuously — each is a PrintWindow round trip
 * on the Rust side, so capturing every window all the time would cost far more
 * than the previews are worth.
 */
function Previews({ entry }: { entry: DockEntry }) {
  const [shots, setShots] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    for (const window_ of entry.windows) {
      // A minimised window has no visible area to capture.
      if (window_.minimized) continue;

      void windowThumbnail(Number(window_.id))
        .then((url) => {
          if (cancelled || !url) return;
          setShots((current) => ({ ...current, [String(window_.id)]: url }));
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [entry]);

  return (
    <div className="previews">
      {entry.windows.map((w) => (
        <figure key={String(w.id)} className="preview">
          {shots[String(w.id)] ? (
            <img className="preview__shot" src={shots[String(w.id)]} alt="" />
          ) : (
            <span className="preview__placeholder">
              {w.minimized ? "Minimised" : "…"}
            </span>
          )}
          <figcaption className="preview__title">{w.title}</figcaption>
        </figure>
      ))}
    </div>
  );
}
