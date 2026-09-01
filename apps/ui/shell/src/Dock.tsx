import { useCallback, useEffect, useState } from "react";

import type { PinnedApp } from "@developer-layer/shared";

import { appIcon, discoverApps, launchApp, refreshPinnedApps } from "./ipc";

interface Props {
  apps: PinnedApp[];
  onApps: (apps: PinnedApp[]) => void;
  onError: (message: string) => void;
}

/**
 * The dock.
 *
 * Phase 04 launches; running state, focus and thumbnails are phase 05.
 *
 * Icons are fetched once per app and held here. They are extracted through a
 * COM round trip on the Rust side and cached to disk, so refetching on every
 * render would be wasteful even though the disk cache makes it cheap.
 */
export function Dock({ apps, onApps, onError }: Props) {
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    for (const app of apps) {
      if (icons[app.id] !== undefined) continue;

      void appIcon(app.id)
        .then((url) => {
          if (cancelled || !url) return;
          setIcons((current) => ({ ...current, [app.id]: url }));
        })
        // A missing icon is not worth an error banner; the initial renders as
        // a fallback and the app still launches.
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [apps, icons]);

  const launch = useCallback(
    (app: PinnedApp) => {
      setBusy(app.id);
      launchApp(app.id)
        .catch((e: unknown) => onError(String(e)))
        // Clearing on a timer rather than on window-appears: knowing when an
        // app's window shows up is phase 05's job, and the indicator is only
        // there to confirm the click registered.
        .finally(() => window.setTimeout(() => setBusy(null), 600));
    },
    [onError],
  );

  const rediscover = useCallback(() => {
    void refreshPinnedApps()
      .then((found) => {
        onApps(found);
        // Discovery may have found an app at a new location, so drop the icon
        // map and let it refill.
        setIcons({});
      })
      .catch((e: unknown) => onError(String(e)));
  }, [onApps, onError]);

  if (apps.length === 0) {
    return (
      <section className="dock dock--empty">
        <span className="dock__hint">No applications pinned yet.</span>
        <button type="button" onClick={rediscover}>
          Find installed apps
        </button>
      </section>
    );
  }

  return (
    <section className="dock">
      <ul className="dock__items">
        {apps.map((app) => (
          <li key={app.id}>
            <button
              type="button"
              className={`dock__app${busy === app.id ? " dock__app--busy" : ""}`}
              title={app.displayName}
              onClick={() => launch(app)}
            >
              {icons[app.id] ? (
                <img className="dock__icon" src={icons[app.id]} alt="" />
              ) : (
                <span className="dock__initial" aria-hidden="true">
                  {app.displayName.charAt(0)}
                </span>
              )}
              <span className="dock__name">{app.displayName}</span>
            </button>
          </li>
        ))}
      </ul>

      <button type="button" className="dock__refresh" onClick={rediscover}>
        Rescan
      </button>
    </section>
  );
}

/** Discover installed apps without pinning them, for a first-run preview. */
export function useDiscovery(onError: (message: string) => void) {
  const [found, setFound] = useState<PinnedApp[] | null>(null);

  useEffect(() => {
    void discoverApps()
      .then(setFound)
      .catch((e: unknown) => onError(String(e)));
  }, [onError]);

  return found;
}
