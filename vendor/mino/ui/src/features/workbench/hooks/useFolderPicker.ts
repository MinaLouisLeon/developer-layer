import { useCallback, useEffect, useState } from "react";

import type { DirEntry } from "@/Types";
import { useTransport } from "@/context/TransportContext";
import { describeFailure } from "@/lib/transportError";

import { useSessionContext } from "../context/SessionContext";

/**
 * Browsing for a working folder on the connected host.
 *
 * A native dialog cannot do this over SSH - it browses the machine the app
 * runs on, not the one the session is open to - so remote sessions pick from a
 * real listing instead.
 *
 * Navigation stays inside the current root, because that is what the path
 * guard allows and the guard is not negotiable. Reaching anywhere else is the
 * job of the path box: typing an absolute path re-roots the session there,
 * which is exactly what `connect` is documented to do.
 */
export function useFolderPicker() {
  const transport = useTransport();
  const { connection, changeFolder } = useSessionContext();

  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  const load = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const listed = await transport.listDir(path);
        setEntries(listed.filter((entry) => entry.kind === "directory"));
        setCurrent(path);
      } catch (failure) {
        setError(describeFailure(failure));
      } finally {
        setLoading(false);
      }
    },
    [transport],
  );

  // Opening starts at the session root, which after a fresh SSH connection is
  // the account's home directory.
  useEffect(() => {
    if (!open || !connection) return;
    setManual(connection.root);
    void load(connection.root);
  }, [open, connection, load]);

  const enter = useCallback((entry: DirEntry) => void load(entry.path), [load]);

  const choose = useCallback(async () => {
    if (!current) return;
    setOpen(false);
    await changeFolder(current);
  }, [current, changeFolder]);

  const jump = useCallback(async () => {
    const path = manual.trim();
    if (!path) return;
    setOpen(false);
    // Outside the current root this re-roots rather than lists, so it is the
    // one way to reach a folder the guard would otherwise refuse.
    await changeFolder(path);
  }, [manual, changeFolder]);

  return {
    open,
    show: () => setOpen(true),
    hide: () => setOpen(false),
    current,
    entries,
    loading,
    error,
    manual,
    setManual,
    enter,
    choose,
    jump,
  };
}
