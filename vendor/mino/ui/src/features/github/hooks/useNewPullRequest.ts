import { useCallback, useEffect, useState } from "react";

import type { GitHubCreated } from "@/Types";
import { useTransport } from "@/context/TransportContext";
import { describeFailure } from "@/lib/transportError";

import { useGitHubContext } from "../context/GitHubContext";
import { ask } from "../query";
import type { NewPullRequestState } from "../types";

/**
 * The one thing in this feature that writes.
 *
 * Three properties, and each is here because a pull request is **public the
 * moment it lands**:
 *
 * - **Asking and creating are two functions.** `ask()` opens the
 *   confirmation, `confirm()` sends it. A single handler would make an
 *   accidental click on a form's submit button into something everybody
 *   watching the repository can see - which is the risk this whole section is
 *   shaped around.
 * - **The confirmation shows what will be made**, not that something will. The
 *   title, the branch pair and whether it is a draft all come from this state
 *   and are rendered by `CreatePrConfirm`.
 * - **The URL comes back.** A pull request that was created and whose address
 *   the author has to go and find is one the app only half opened.
 *
 * The head branch is deliberately not a field. `gh` uses the branch that is
 * checked out, which is the one the author is looking at; offering a choice
 * would be this app deciding from a value it read a moment ago what git knows
 * for certain now.
 */
export function useNewPullRequest(active: boolean): NewPullRequestState {
  const transport = useTransport();
  const { repository, branch, refresh } = useGitHubContext();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [base, setBase] = useState("");
  const [draft, setDraft] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<GitHubCreated | null>(null);

  // Seeded from the repository's own default branch, and only while the field
  // is untouched: a base the author has typed is a decision, and a probe
  // landing afterwards must not overwrite it.
  const defaultBranch = repository?.defaultBranch ?? null;
  useEffect(() => {
    if (defaultBranch !== null) setBase((current) => current || defaultBranch);
  }, [defaultBranch]);

  const confirm = useCallback(() => {
    setConfirming(false);
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const answer = await ask(
          transport.github,
          { kind: "createPullRequest", detail: { title, body, base, draft } },
          "created",
        );
        setCreated(answer);
        // Cleared only on success, so a refused request leaves the author
        // with everything they wrote and something to fix.
        setTitle("");
        setBody("");
        // The list below now has a row it did not have a moment ago.
        refresh();
      } catch (failure) {
        setError(describeFailure(failure));
      } finally {
        setBusy(false);
      }
    })();
  }, [transport, title, body, base, draft, refresh]);

  // A new branch is a new pull request to think about.
  //
  // Keyed on the branch and **not** on the refresh nonce, which is a real
  // distinction rather than a detail: creating one ends in a refresh, so
  // clearing on the nonce would wipe the URL of the pull request that had
  // just been made, in the same tick it appeared.
  useEffect(() => setCreated(null), [branch]);

  return {
    open: open && active,
    toggle: useCallback(() => setOpen((current) => !current), []),
    title,
    setTitle,
    body,
    setBody,
    base,
    setBase,
    draft,
    toggleDraft: useCallback(() => setDraft((current) => !current), []),
    confirming,
    ask: useCallback(() => setConfirming(true), []),
    cancel: useCallback(() => setConfirming(false), []),
    confirm,
    busy,
    error,
    created,
  };
}
