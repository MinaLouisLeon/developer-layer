import { Notice } from "@/components/ui";

import { useFolderPicker } from "../hooks/useFolderPicker";
import { WORKBENCH_COPY } from "../messages";

interface FolderPickerProps {
  picker: ReturnType<typeof useFolderPicker>;
}

/**
 * The remote folder browser. Presentational: every piece of state and every
 * transport call lives in `useFolderPicker`.
 */
export function FolderPicker({ picker }: FolderPickerProps) {
  if (!picker.open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={WORKBENCH_COPY.pickerTitle}
      className="absolute inset-0 z-10 flex items-center justify-center bg-surfaceSunken/80 p-6"
    >
      <div className="flex max-h-full w-full max-w-lg flex-col gap-3 rounded border border-borderStrong bg-surfaceRaised p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium text-text">{WORKBENCH_COPY.pickerTitle}</h2>
          <button
            type="button"
            onClick={picker.hide}
            className="text-xs text-textMuted hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
          >
            {WORKBENCH_COPY.cancel}
          </button>
        </div>

        <p className="truncate font-mono text-xs text-textMuted" title={picker.current ?? ""}>
          {picker.current ?? "…"}
        </p>

        <ul className="min-h-24 max-h-64 overflow-y-auto rounded border border-border">
          {picker.loading ? (
            <li className="px-3 py-2 text-xs text-textFaint">{WORKBENCH_COPY.loading}</li>
          ) : picker.entries.length === 0 ? (
            <li className="px-3 py-2 text-xs text-textFaint">{WORKBENCH_COPY.noSubfolders}</li>
          ) : (
            picker.entries.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  onClick={() => picker.enter(entry)}
                  className="w-full px-3 py-1.5 text-left text-sm text-text hover:bg-surfaceHover focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong"
                >
                  {entry.name}
                </button>
              </li>
            ))
          )}
        </ul>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-textMuted">{WORKBENCH_COPY.pathLabel}</span>
          <input
            type="text"
            value={picker.manual}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => picker.setManual(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void picker.jump();
              }
            }}
            className="rounded border border-border bg-surfaceSunken px-2 py-1.5 font-mono text-xs text-text focus:outline-none focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accentStrong"
          />
          <span className="text-xs text-textFaint">{WORKBENCH_COPY.pathHint}</span>
        </label>

        {picker.error ? (
          <Notice variant="danger" title={WORKBENCH_COPY.pickerErrorTitle}>
            {picker.error}
          </Notice>
        ) : null}

        <button
          type="button"
          onClick={() => void picker.choose()}
          disabled={!picker.current || picker.loading}
          className="rounded border border-borderStrong bg-surface px-4 py-2 text-sm font-medium text-text hover:border-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong disabled:opacity-60"
        >
          {WORKBENCH_COPY.useThisFolder}
        </button>
      </div>
    </div>
  );
}
