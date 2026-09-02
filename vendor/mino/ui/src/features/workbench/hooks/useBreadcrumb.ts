import { useEffect, useState } from "react";

import { useTransport } from "@/context/TransportContext";
import { splitSegments } from "@/lib/path";

import { NU_PARAM_PATH, NU_PIPELINES } from "../pipelines";

/**
 * Breadcrumb segments for the working directory.
 *
 * Asks Nushell to split the path so the target's own rules decide, and falls
 * back to a plain split when `nu` is unavailable or the call fails. The plain
 * split is rendered first, so the breadcrumb is never empty while waiting.
 */
export function useBreadcrumb(path: string | null): string[] {
  const [segments, setSegments] = useState<string[]>([]);
  const transport = useTransport();

  useEffect(() => {
    if (!path) {
      setSegments([]);
      return;
    }
    let cancelled = false;
    setSegments(splitSegments(path));

    transport
      .runStructured({
        pipeline: NU_PIPELINES.pathSplit,
        params: { [NU_PARAM_PATH]: path },
        cwd: null,
        timeoutMs: null,
      })
      .then((output) => {
        if (cancelled || !Array.isArray(output.value)) return;
        setSegments(output.value.filter((s): s is string => typeof s === "string"));
      })
      .catch(() => {
        // nu is missing or the pipeline failed; the plain split already shows.
      });

    return () => {
      cancelled = true;
    };
  }, [path, transport]);

  return segments;
}
