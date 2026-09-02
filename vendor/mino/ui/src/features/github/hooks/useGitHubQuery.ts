import { useEffect, useState } from "react";

import type { GitHubDetail, GitHubQuery, GitHubResponseKind } from "@/Types";
import { useTransport } from "@/context/TransportContext";
import { describeFailure } from "@/lib/transportError";

import { ask } from "../query";
import type { SectionQuery } from "../types";

/**
 * One section's read, and the whole of this feature's polling policy.
 *
 * Every section asks through here, which is what makes "no timer" a property
 * of the feature rather than a rule four hooks each have to remember. The
 * effect runs when the request changes, when `nonce` changes - the header's
 * refresh, and a branch change - and at no other time. There is no interval
 * anywhere in this folder.
 *
 * `request` of `null` means "do not ask": a collapsed section, a probe that is
 * not ready, a branch that does not exist. That is the second half of the same
 * policy. Most repositories have no open issues worth a call before somebody
 * opens the section, and a call for a section nobody is looking at is a call
 * spent from the reader's rate limit for nothing.
 *
 * The request is compared **by value**, because a caller builds a fresh object
 * every render and comparing by identity would make this poll after all - at
 * render speed, which is worse than a timer.
 */
export function useGitHubQuery<K extends GitHubResponseKind>(
  request: GitHubQuery | null,
  expected: K,
  nonce: number,
): SectionQuery<GitHubDetail<K>> {
  const transport = useTransport();
  // Held as `unknown` and narrowed on the way out. `GitHubDetail<K>` is a
  // distributive conditional, and TypeScript cannot prove that a value of one
  // branch is assignable to the union of all of them - even though `ask`
  // rejects when the response is the wrong shape. One cast, in one place, is
  // the price of five features sharing one call.
  const [state, setState] = useState<SectionQuery<unknown>>({
    data: null,
    loading: false,
    error: null,
  });

  // The dependency, and the reason it is a string: a request built inline is a
  // new object on every render, and `useEffect` compares by identity.
  const key = request === null ? null : JSON.stringify(request);

  useEffect(() => {
    if (key === null) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((current) => ({ ...current, loading: true }));

    void (async () => {
      try {
        const data = await ask(
          transport.github,
          JSON.parse(key) as GitHubQuery,
          expected,
        );
        if (cancelled) return;
        setState({ data, loading: false, error: null });
      } catch (failure) {
        if (cancelled) return;
        // The data is dropped rather than kept beside the error. A list from
        // before a failure is a list that may no longer be true, and showing
        // it under a red notice invites acting on it.
        setState({ data: null, loading: false, error: describeFailure(failure) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key, expected, nonce, transport]);

  return state as SectionQuery<GitHubDetail<K>>;
}
