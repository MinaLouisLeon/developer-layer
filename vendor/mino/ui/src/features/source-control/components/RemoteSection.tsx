import { ChevronDown, ChevronRight, Download, Upload } from "lucide-react";

import { useRemote } from "../hooks/useRemote";
import { REMOTE_COPY } from "../messages";
import { PushConfirm } from "./PushConfirm";

const BUTTON =
  "flex items-center gap-1 rounded border border-borderStrong px-1.5 py-1 text-xs text-text hover:bg-surfaceHover focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong disabled:opacity-40";

/**
 * Fetch, pull and push - #7.
 *
 * The three controls are laid out in order of what they can lose, left to
 * right: fetch touches no file, pull can replace every file under the other
 * panes, push can change what other people see. The force control is not in
 * that row at all. It sits below, styled as the destructive thing it is, so
 * it cannot be hit by somebody aiming for push.
 *
 * **Nothing here offers force as a way out of a rejected push.** When a push
 * is rejected the error says to fetch and pull, and the force control is
 * exactly where it was - because the moment somebody has been told the remote
 * has commits they do not have is the worst possible moment to offer to
 * delete those commits.
 *
 * Presentational: every decision it renders comes from `useRemote`.
 */
export function RemoteSection({ active }: { active: boolean }) {
  const remote = useRemote(active);
  const Chevron = remote.open ? ChevronDown : ChevronRight;
  const ready = remote.remote !== null && remote.branch !== null;

  return (
    <section
      aria-label={REMOTE_COPY.heading}
      className="border-t border-border py-1"
    >
      <header className="flex items-center gap-2 px-2 py-1">
        <button
          type="button"
          onClick={remote.toggle}
          aria-expanded={remote.open}
          title={remote.open ? REMOTE_COPY.hide : REMOTE_COPY.show}
          className="flex items-center gap-1 rounded text-xs font-medium uppercase tracking-wide text-textMuted hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
        >
          <Chevron size={12} strokeWidth={1.5} aria-hidden="true" />
          {REMOTE_COPY.heading}
        </button>
        {remote.remote ? (
          <span className="truncate text-xs text-textFaint">
            {remote.remote}
          </span>
        ) : null}
      </header>

      {remote.open ? (
        <div className="flex flex-col gap-1.5 px-2 pb-2 pt-1">
          {remote.remote === null ? (
            <p className="text-xs text-textFaint">{REMOTE_COPY.noRemote}</p>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={remote.fetch}
                  disabled={remote.busy || !ready}
                  title={REMOTE_COPY.fetchHint}
                  className={BUTTON}
                >
                  <Download size={12} strokeWidth={1.5} aria-hidden="true" />
                  {REMOTE_COPY.fetch}
                </button>
                <button
                  type="button"
                  onClick={remote.pull}
                  disabled={remote.busy || !ready}
                  title={REMOTE_COPY.pullHint}
                  className={BUTTON}
                >
                  {REMOTE_COPY.pull}
                </button>
                <button
                  type="button"
                  onClick={remote.askPush}
                  disabled={remote.busy || !ready}
                  title={REMOTE_COPY.pushHint}
                  className={BUTTON}
                >
                  <Upload size={12} strokeWidth={1.5} aria-hidden="true" />
                  {REMOTE_COPY.push}
                </button>
              </div>

              <label
                className="flex items-center gap-1.5 text-xs text-textFaint"
                title={REMOTE_COPY.rebaseHint}
              >
                <input
                  type="checkbox"
                  checked={remote.rebase}
                  onChange={remote.toggleRebase}
                  disabled={remote.busy}
                />
                {REMOTE_COPY.rebaseLabel}
              </label>

              {/* Below the row, and styled as what it is. Never offered as a
                  recovery from a rejection - see the component doc. */}
              <button
                type="button"
                onClick={remote.askForcePush}
                disabled={remote.busy || !ready}
                title={REMOTE_COPY.forceHint}
                className="self-start rounded border border-border px-1.5 py-1 text-xs text-textFaint hover:border-danger hover:text-danger focus:outline-none focus-visible:ring-1 focus-visible:ring-danger disabled:opacity-40"
              >
                {REMOTE_COPY.forceLabel}
              </button>
            </>
          )}

          {remote.busy ? (
            <p className="text-xs text-textFaint">{REMOTE_COPY.working}</p>
          ) : null}
          {remote.outcome ? (
            <p className="text-xs text-accent">{remote.outcome}</p>
          ) : null}
          {remote.error ? (
            <p className="text-xs text-danger">{remote.error}</p>
          ) : null}
        </div>
      ) : null}

      <PushConfirm
        prompt={remote.prompt}
        onConfirm={remote.confirmPush}
        onCancel={remote.cancelPush}
      />
    </section>
  );
}
