import { useCallback, useEffect, useState } from "react";

/**
 * State mirrored into localStorage.
 *
 * Layout preferences only. Credentials, keys, host secrets and file contents
 * must never be written here - see the storage rule in CLAUDE.md.
 */
export function usePersistentState<T>(
  key: string,
  fallback: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback));

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be full or disabled. A lost layout preference is not
      // worth interrupting the session for.
    }
  }, [key, value]);

  const update = useCallback((next: T) => setValue(next), []);
  return [value, update];
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
