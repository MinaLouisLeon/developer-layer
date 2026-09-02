import { RefreshCw } from "lucide-react";

import { Pane, StatusMessage } from "@/components/ui";

import { useGitHubContext } from "../context/GitHubContext";
import { GITHUB_COPY } from "../messages";
import { ChecksSection } from "./ChecksSection";
import { ExternalLink } from "./ExternalLink";
import { IssuesSection } from "./IssuesSection";
import { NewPullRequest } from "./NewPullRequest";
import { PullRequestSection } from "./PullRequestSection";

/**
 * The GitHub view.
 *
 * Its whole job before the sections is to tell four silences apart. `gh` not
 * installed, `gh` not signed in, a remote that is not GitHub, and something
 * that actually went wrong are four different situations with four different
 * next moves, and a view that said "unavailable" to all of them would be worse
 * than no view. Each gets its own title; Rust supplies the sentence underneath,
 * including `gh`'s own words when it had any.
 *
 * The refresh in the header is the *only* thing that makes this pane ask
 * again, besides mounting and a branch change. There is no timer anywhere in
 * this feature: the rate limit is somebody's account budget, and a workbench
 * that quietly made network calls forever is a surprise nobody consented to.
 *
 * Presentational: every decision comes from `GitHubContext` and the section
 * hooks.
 */
export function GitHubPane() {
  const { state, repository, detail, refresh } = useGitHubContext();
  const ready = state === "ready";

  if (!ready) {
    return (
      <Pane title={GITHUB_COPY.title}>
        <StatusMessage
          title={QUIET_TITLES[state]}
          // gh's own sentence where there is one. The only state Rust has
          // nothing to say about is "no folder is open", which is this app's
          // own fact rather than gh's.
          description={
            detail ??
            (state === "notConnected"
              ? GITHUB_COPY.notConnectedBody
              : undefined)
          }
          tone={state === "failed" ? "danger" : "info"}
        />
      </Pane>
    );
  }

  return (
    <Pane
      title={GITHUB_COPY.title}
      accessory={
        <span className="flex min-w-0 items-center gap-1">
          {repository ? (
            <>
              <span
                className="truncate text-xs text-textFaint"
                title={repository.nameWithOwner}
              >
                {repository.nameWithOwner}
              </span>
              <ExternalLink
                url={repository.url}
                title={GITHUB_COPY.openRepository}
              />
            </>
          ) : null}
          <button
            type="button"
            onClick={refresh}
            title={GITHUB_COPY.refreshHint}
            className="shrink-0 rounded p-1 text-textFaint hover:bg-surfaceHover hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
          >
            <RefreshCw size={13} strokeWidth={1.5} aria-hidden="true" />
            <span className="sr-only">{GITHUB_COPY.refresh}</span>
          </button>
        </span>
      }
    >
      {/* Checks first, because whether the branch is green is the thing worth
          knowing before anything else here. New pull request last, because it
          is the one you reach for occasionally rather than all day. */}
      <div className="h-full min-h-0 overflow-y-auto">
        <ChecksSection active={ready} />
        <PullRequestSection active={ready} />
        <IssuesSection active={ready} />
        <NewPullRequest active={ready} />
      </div>
    </Pane>
  );
}

/**
 * One title per silence. The sentence underneath is Rust's, so nothing here
 * duplicates it - see `mino_core::github::probe`.
 */
const QUIET_TITLES = {
  loading: GITHUB_COPY.loadingTitle,
  notConnected: GITHUB_COPY.notConnectedTitle,
  absent: GITHUB_COPY.absentTitle,
  unauthenticated: GITHUB_COPY.unauthenticatedTitle,
  unsupported: GITHUB_COPY.unsupportedTitle,
  failed: GITHUB_COPY.failedTitle,
  ready: GITHUB_COPY.title,
} as const;
