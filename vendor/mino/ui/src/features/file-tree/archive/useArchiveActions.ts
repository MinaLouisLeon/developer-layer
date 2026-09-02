// A Developer Layer addition. See vendor/mino/VENDOR.md, "Patches".
import { useCallback, useEffect, useState } from "react";

import {
  archiveAvailable,
  archiveCompress,
  archiveExtract,
  type ArchiveOutcome,
} from "./commands";

export interface ArchiveActions {
  /**
   * `null` while the answer is still being fetched.
   *
   * Distinguished from `false` on purpose: a menu that renders "WinRAR is not
   * installed" for the first frame and then contradicts itself is worse than
   * one that renders nothing until it knows.
   */
  available: boolean | null;
  busy: boolean;
  error: string | null;
  outcome: ArchiveOutcome | null;
  extract: (path: string) => Promise<void>;
  compress: (paths: string[]) => Promise<void>;
  clear: () => void;
}

/**
 * Availability is asked once per mount, not once per menu.
 *
 * Nothing here caches across mounts, though: a user who installs WinRAR while
 * the shell is running should not have to restart it, and the tree remounts
 * often enough that this is the cheaper half of that trade.
 */
export function useArchiveActions(onChanged: () => void): ArchiveActions {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ArchiveOutcome | null>(null);

  useEffect(() => {
    let cancelled = false;
    archiveAvailable()
      .then((yes) => {
        if (!cancelled) setAvailable(yes);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const run = useCallback(
    async (action: () => Promise<ArchiveOutcome>) => {
      setBusy(true);
      setError(null);
      setOutcome(null);
      try {
        setOutcome(await action());
        // The archive or the extracted folder is a new entry, and the tree has
        // no other way to learn about it: nothing in mino watches the
        // filesystem.
        onChanged();
      } catch (failure) {
        // Rust serialises every ArchiveError as its message.
        setError(typeof failure === "string" ? failure : String(failure));
      } finally {
        setBusy(false);
      }
    },
    [onChanged],
  );

  return {
    available,
    busy,
    error,
    outcome,
    extract: useCallback((path: string) => run(() => archiveExtract(path)), [run]),
    compress: useCallback(
      (paths: string[]) => run(() => archiveCompress(paths)),
      [run],
    ),
    clear: useCallback(() => {
      setError(null);
      setOutcome(null);
    }, []),
  };
}
