import { useCallback, useEffect, useState } from "react";

import type { Config } from "@developer-layer/shared";

import { setStartAtLogon, setTaskbarReplacement, startAtLogon } from "./ipc";

interface Props {
  config: Config | null;
  onError: (message: string) => void;
  onChanged: () => void;
}

/**
 * The two switches that change what the machine does when Developer Layer is
 * not on screen.
 *
 * Both are off by default and both say what they will do before they do it.
 * That is not padding: one of them hides the Windows taskbar, which is the
 * most destructive thing this application can be asked to do, and the way back
 * has to be readable *before* the click rather than discovered afterwards.
 */
export function Settings({ config, onError, onChanged }: Props) {
  const [logon, setLogon] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  // Asked of the scheduler, not read from the config: the task can be removed
  // in Task Scheduler without this application knowing, and a switch showing
  // what we last wrote rather than what is true would be lying.
  const refreshLogon = useCallback(() => {
    startAtLogon().then(setLogon).catch(() => setLogon(null));
  }, []);

  useEffect(refreshLogon, [refreshLogon]);

  const toggle = (run: () => Promise<void>) => {
    setBusy(true);
    run()
      .then(() => {
        refreshLogon();
        onChanged();
      })
      .catch((e: unknown) => onError(String(e)))
      .finally(() => setBusy(false));
  };

  const taskbarHidden = config?.general.replaceNativeTaskbar ?? false;
  const restoreHotkey = config?.general.panicRestoreHotkey ?? "Ctrl+Alt+Shift+T";

  return (
    <section className="settings">
      <h2>Settings</h2>

      <label className="settings__row">
        <input
          type="checkbox"
          checked={taskbarHidden}
          disabled={busy || !config}
          onChange={(event) =>
            toggle(() => setTaskbarReplacement(event.target.checked))
          }
        />
        <span className="settings__text">
          <span className="settings__name">Replace the Windows taskbar</span>
          <span className="settings__note">
            Hides the taskbar on every display and reserves space for the dock.
            {/* Before the click, not after. Somebody who has just lost their
                taskbar is not in a state to go looking for this. */}{" "}
            <strong>{restoreHotkey}</strong> brings it back at any time, and a
            guardian process restores it even if Developer Layer is killed.
          </span>
        </span>
      </label>

      <label className="settings__row">
        <input
          type="checkbox"
          checked={logon ?? false}
          disabled={busy || logon === null}
          onChange={(event) => toggle(() => setStartAtLogon(event.target.checked))}
        />
        <span className="settings__text">
          <span className="settings__name">Start at logon, elevated</span>
          <span className="settings__note">
            Registers a scheduled task that runs at logon with administrator
            rights. Elevation is what lets the grid move windows owned by
            elevated programs; without it those are silently skipped. Turning
            this on needs administrator rights itself.
          </span>
        </span>
      </label>
    </section>
  );
}
