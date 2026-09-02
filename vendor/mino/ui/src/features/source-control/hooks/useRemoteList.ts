import { useEffect, useState } from "react";

import type { GitRemote } from "@/Types";
import { useTransport } from "@/context/TransportContext";

/**
 * The configured remotes, read once the section is opened.
 *
 * Split from `useRemote` because it has a lifetime of its own and a different
 * policy from everything around it: a repository's remotes do not change while
 * somebody is working, so this reads when the section opens and then never
 * again - where the three calls beside it run whenever the reader presses a
 * button.
 *
 * A failure answers with an empty list rather than raising. The section
 * already has a sentence for "no remote configured", which is what an
 * unreachable `git remote` looks like from here, and a second error channel
 * for a read nobody asked for would crowd out the one that matters - the
 * failure of the call the reader actually made.
 */
export function useRemoteList(active: boolean): GitRemote[] {
  const transport = useTransport();
  const [remotes, setRemotes] = useState<GitRemote[]>([]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void (async () => {
      try {
        const listed = await transport.git.remotes();
        if (!cancelled) setRemotes(listed);
      } catch {
        if (!cancelled) setRemotes([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, transport]);

  return remotes;
}
