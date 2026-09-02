import { Pane, StatusMessage } from "@/components/ui";

// Developer Layer addition. See ../../../../VENDOR.md.
import { ArchiveMenu, ArchiveStatus } from "../archive";
import { useFileTreePane } from "../hooks/useFileTreePane";
import { TreeRows } from "./TreeRows";

/** Presentational: every decision it renders comes from useFileTreePane. */
export function FileTreePane() {
  const {
    root,
    rows,
    rootStatus,
    rootError,
    selectedPath,
    onActivate,
    onExpandKey,
    onContextMenu,
    menu,
    closeMenu,
    archive,
  } = useFileTreePane();

  return (
    <Pane title="Files">
      {!root ? (
        <StatusMessage
          title="No folder open"
          description="Open a folder to browse its contents."
        />
      ) : rootStatus === "error" ? (
        <StatusMessage
          title="Could not read this folder"
          description={rootError ?? undefined}
          tone="danger"
        />
      ) : rootStatus === "loading" && rows.length === 0 ? (
        <StatusMessage title="Loading…" description="Reading the folder." />
      ) : rows.length === 0 ? (
        <StatusMessage
          title="This folder is empty"
          description="Nothing to show here yet."
        />
      ) : (
        <>
          {/* Developer Layer addition: the archive menu and its result. */}
          <ArchiveStatus actions={archive} />
          <TreeRows
            rows={rows}
            selectedPath={selectedPath}
            onActivate={onActivate}
            onExpandKey={onExpandKey}
            onContextMenu={onContextMenu}
          />
          {menu ? (
            <ArchiveMenu target={menu} actions={archive} onClose={closeMenu} />
          ) : null}
        </>
      )}
    </Pane>
  );
}
