import { useCallback, useEffect, useState } from "react";

import type { Capability } from "@developer-layer/shared";

import {
  install,
  installable,
  onInstall,
  voiceCapability,
  type Installable,
  type InstallProgress,
} from "./ipc";

/**
 * Voice setup: what is missing, and the one button that fixes each of it that
 * can be fixed by downloading.
 *
 * The two things voice needs are a speech model of a couple of hundred
 * megabytes and, for the wake word, somebody else's binary — neither of which
 * belongs in the repository. So they are fetched on request, and this is where
 * that request is made.
 */
export function VoiceSetup({ onError }: { onError: (message: string) => void }) {
  const [capability, setCapability] = useState<Capability | null>(null);
  const [assets, setAssets] = useState<Installable[]>([]);
  const [progress, setProgress] = useState<Record<string, InstallProgress>>({});

  const refresh = useCallback(() => {
    voiceCapability().then(setCapability).catch(() => setCapability(null));
    installable().then(setAssets).catch((e: unknown) => onError(String(e)));
  }, [onError]);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    const unlisten = onInstall((update) => {
      setProgress((current) => ({ ...current, [update.id]: update }));
      // A finished download changes what is installed and what voice can do,
      // so both are re-read rather than guessed at from here.
      if (update.done) refresh();
      if (update.error) onError(update.error);
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, [refresh, onError]);

  return (
    <section className="voice">
      <h2>Voice</h2>

      {capability ? (
        <p className="voice__state">
          {capability.usable
            ? capability.wakeWord
              ? "Ready. Say “Atlas”, or hold the voice key."
              : "Ready. Hold the voice key to speak."
            : "Not set up yet."}
        </p>
      ) : null}

      {/* What is missing, each with what to do about it. Rendered even when
          voice works, because the wake word can be absent while the rest is
          fine — and that is a state worth being able to see. */}
      {capability && capability.missing.length > 0 ? (
        <ul className="voice__gaps">
          {capability.missing.map((gap) => (
            <li key={gap.what}>
              <strong>{gap.what}</strong>
              <span>{gap.remedy}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <ul className="voice__assets">
        {assets.map((asset) => {
          const running = progress[asset.id];
          const busy = running !== undefined && running.done === null;
          return (
            <li key={asset.id} className="voice__asset">
              <div className="voice__asset-text">
                <span className="voice__asset-name">
                  {asset.label}
                  {asset.megabytes ? (
                    <span className="voice__asset-size"> · {asset.megabytes} MB</span>
                  ) : null}
                </span>
                <span className="voice__asset-summary">{asset.summary}</span>
              </div>

              {asset.installed && !busy ? (
                <span className="voice__asset-done">Installed</span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void install(asset.id).catch((e: unknown) => onError(String(e)));
                  }}
                >
                  {busy
                    ? // The percentage when the server said how big it is, the
                      // megabytes so far when it did not. A bar that invents a
                      // total jumps backwards when the real one arrives.
                      running.percent !== null
                      ? `${running.percent}%`
                      : `${running.megabytes} MB`
                    : "Download"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
