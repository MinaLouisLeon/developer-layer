import { Notice } from "@/components/ui";

import { START_COPY } from "../messages";
import { useConnectionOptions } from "../hooks/useConnectionOptions";
import { ConnectionOption } from "./ConnectionOption";
import { SshForm } from "./SshForm";

/** The entry point. Presentational; the wiring lives in useConnectionOptions. */
export function StartScreen() {
  const { options, select, showSshForm, closeSshForm, connecting, error } =
    useConnectionOptions();

  return (
    <main className="flex h-full items-center justify-center bg-surface p-6">
      <div className="w-full max-w-md">
        <h1 className="text-lg font-semibold text-text">{START_COPY.heading}</h1>
        <p className="mt-1 text-sm text-textMuted">{START_COPY.tagline}</p>

        <div className="mt-6">
          {showSshForm ? (
            <SshForm onCancel={closeSshForm} />
          ) : (
            <div className="flex flex-col gap-3">
              {options.map((option) => (
                <ConnectionOption
                  key={option.id}
                  option={option}
                  onSelect={(id) => select(id)}
                />
              ))}
            </div>
          )}
        </div>

        {connecting ? (
          <p role="status" className="mt-4 text-xs text-textMuted">
            Opening…
          </p>
        ) : null}

        {error ? (
          <div className="mt-4">
            <Notice variant="danger" title={START_COPY.errorTitle}>
              {error}
            </Notice>
          </div>
        ) : null}
      </div>
    </main>
  );
}
