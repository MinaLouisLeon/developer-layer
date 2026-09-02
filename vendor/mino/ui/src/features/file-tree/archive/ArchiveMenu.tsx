// A Developer Layer addition. See vendor/mino/VENDOR.md, "Patches".
import { useEffect, useRef, useState } from "react";

import type { DirEntry } from "@/Types";

import { archiveSupported } from "./commands";
import type { ArchiveActions } from "./useArchiveActions";

export interface ArchiveMenuTarget {
  entry: DirEntry;
  /** Viewport coordinates of the click that opened the menu. */
  x: number;
  y: number;
}

interface ArchiveMenuProps {
  target: ArchiveMenuTarget;
  actions: ArchiveActions;
  onClose: () => void;
}

/**
 * The file tree's right-click menu, and the only archive affordance there is.
 *
 * WinRAR's window never opens — the locked decision is archive actions in this
 * tree, driven by `rar.exe`, so everything here calls a host command and the
 * result comes back as a message rather than as a second application.
 */
export function ArchiveMenu({ target, actions, onClose }: ArchiveMenuProps) {
  const { entry } = target;
  const [extractable, setExtractable] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  // Asked of Rust rather than matched on the name here: which extensions the
  // host can open is the host's to know, and a second list in TypeScript is a
  // second list to get wrong.
  useEffect(() => {
    let cancelled = false;
    if (entry.kind === "directory") {
      setExtractable(false);
      return;
    }
    archiveSupported(entry.path)
      .then((yes) => {
        if (!cancelled) setExtractable(yes);
      })
      .catch(() => {
        if (!cancelled) setExtractable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entry.kind, entry.path]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    menu.current?.focus();
  }, []);

  const items: { label: string; run: () => void }[] = [];
  if (extractable) {
    items.push({
      label: "Extract here",
      run: () => void actions.extract(entry.path),
    });
  }
  items.push({
    label: `Compress "${entry.name}" to .rar`,
    run: () => void actions.compress([entry.path]),
  });

  return (
    <>
      {/* Catches the click that dismisses the menu before it reaches a row
          underneath, which would otherwise select whatever was behind it. */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        ref={menu}
        role="menu"
        tabIndex={-1}
        aria-label="Archive actions"
        // Positioned from the pointer and clamped by the viewport, so a
        // right-click near the bottom of a tall tree does not open a menu
        // below the fold.
        style={{
          left: Math.min(target.x, window.innerWidth - 240),
          top: Math.min(target.y, window.innerHeight - 120),
        }}
        className="fixed z-50 w-56 rounded border border-border bg-surfaceRaised py-1 text-sm shadow-lg focus:outline-none"
      >
        {actions.available === null ? (
          <p className="px-3 py-1.5 text-textFaint">Checking for WinRAR…</p>
        ) : !actions.available ? (
          <p className="px-3 py-1.5 text-textFaint">
            WinRAR&apos;s command-line tools are not installed.
          </p>
        ) : (
          items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={actions.busy}
              onClick={() => {
                item.run();
                onClose();
              }}
              className="block w-full truncate px-3 py-1.5 text-left text-text hover:bg-surfaceHover disabled:text-textFaint"
            >
              {item.label}
            </button>
          ))
        )}
      </div>
    </>
  );
}
