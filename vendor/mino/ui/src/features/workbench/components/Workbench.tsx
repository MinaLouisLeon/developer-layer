import { GitRefreshProvider } from "@/features/git/context/GitRefreshContext";
import { GitStatusProvider } from "@/features/git/context/GitStatusContext";
import { GitHubProvider } from "@/features/github/context/GitHubContext";
import { SidebarProvider } from "@/features/sidebar/context/SidebarContext";
import { DraftsProvider } from "@/features/viewer/context/DraftsContext";
import { ViewerModeProvider } from "@/features/viewer/context/ViewerModeContext";

import { WorkbenchPanes } from "./WorkbenchPanes";

/**
 * The workbench: the sidebar's and git's state, wrapped around the panes that
 * read them.
 *
 * Both providers are here rather than in `App` because neither has anything to
 * say while the start screen is up - there is no folder to browse, search or
 * read a working tree from - and scoping them to the workbench means they are
 * created when a session opens and gone when one closes.
 *
 * Git wraps the sidebar because both the header and the tree read it: one
 * `git status` for the whole window, not one per pane.
 *
 * Drafts are here for the same reason: the editor writes them and the source
 * control panel clears them when it discards a file, so neither can own the
 * store outright. And the viewer's mode, because the history list sets it when
 * it opens a file at a commit.
 *
 * `GitRefreshProvider` is outside `GitStatusProvider` because status is one of
 * its subscribers: a checkout changes the working tree, and the tree, the
 * viewer, search and the status all have to re-read from the same event rather
 * than each deciding for itself when to look again.
 *
 * `GitHubProvider` sits *inside* `GitStatusProvider` because it reads the
 * branch from it. Every GitHub section is scoped to a branch, and two readings
 * of which branch is checked out could disagree - the workbench header is the
 * one already showing it. It is one `gh` probe for the whole window, on the
 * same terms as one `git status`.
 */
export function Workbench() {
  return (
    <DraftsProvider>
      <GitRefreshProvider>
        <GitStatusProvider>
          <GitHubProvider>
            <ViewerModeProvider>
              <SidebarProvider>
                <WorkbenchPanes />
              </SidebarProvider>
            </ViewerModeProvider>
          </GitHubProvider>
        </GitStatusProvider>
      </GitRefreshProvider>
    </DraftsProvider>
  );
}
