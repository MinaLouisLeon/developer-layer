import { Pane, StatusMessage } from "@/components/ui";
import { useSelection } from "@/features/workbench/context/SelectionContext";
import { useSessionContext } from "@/features/workbench/context/SessionContext";

import { useFileSearch } from "../hooks/useFileSearch";
import { describeCounts, SEARCH_COPY } from "../messages";
import { SearchField } from "./SearchField";
import { SearchResults } from "./SearchResults";

/** Presentational: every decision it renders comes from useFileSearch. */
export function SearchPane() {
  const { connection } = useSessionContext();
  const { selected } = useSelection();
  const search = useFileSearch();
  const hasFolder = connection !== null;

  return (
    <Pane
      title={SEARCH_COPY.title}
      accessory={
        search.status === "ready"
          ? describeCounts(search.hits.length, search.scanned)
          : undefined
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <SearchField
          query={search.query}
          setQuery={search.setQuery}
          disabled={!hasFolder}
        />
        <div className="min-h-0 flex-1 overflow-auto">
          {!hasFolder ? (
            <StatusMessage
              title={SEARCH_COPY.noFolderTitle}
              description={SEARCH_COPY.noFolderDescription}
            />
          ) : search.status === "idle" ? (
            <StatusMessage
              title={SEARCH_COPY.promptTitle}
              description={SEARCH_COPY.promptDescription}
            />
          ) : search.status === "error" ? (
            <StatusMessage
              title={SEARCH_COPY.errorTitle}
              description={search.error ?? undefined}
              tone="danger"
            />
          ) : search.status === "searching" ? (
            <StatusMessage
              title={SEARCH_COPY.searching}
              description={SEARCH_COPY.searchingDescription}
            />
          ) : search.hits.length === 0 ? (
            <StatusMessage
              title={SEARCH_COPY.emptyTitle}
              description={SEARCH_COPY.emptyDescription}
            />
          ) : (
            <SearchResults
              hits={search.hits}
              selectedPath={selected?.path ?? null}
              truncated={search.truncated}
              onActivate={search.onActivate}
            />
          )}
        </div>
      </div>
    </Pane>
  );
}
