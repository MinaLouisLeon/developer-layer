import { Notice } from "@/components/ui";

import { useSshForm } from "../hooks/useSshForm";
import { START_COPY } from "../messages";
import { SshField } from "./SshField";

interface SshFormProps {
  onCancel: () => void;
}

/**
 * The SSH connection form. Presentational: every piece of state, validation
 * and the connect call live in `useSshForm`.
 */
export function SshForm({ onCancel }: SshFormProps) {
  const { values, fields, update, submit, ready, connecting, error } = useSshForm();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-text">{START_COPY.sshFormTitle}</h2>
        <button
          type="button"
          onClick={onCancel}
          disabled={connecting}
          className="text-xs text-textMuted hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong disabled:opacity-60"
        >
          {START_COPY.back}
        </button>
      </div>

      {fields.map((field) => (
        <SshField
          key={field.name}
          field={field}
          value={values[field.name]}
          onChange={update}
          disabled={connecting}
        />
      ))}

      <button
        type="submit"
        disabled={!ready || connecting}
        className="mt-1 rounded border border-borderStrong bg-surfaceRaised px-4 py-2 text-sm font-medium text-text hover:border-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong disabled:cursor-not-allowed disabled:opacity-60"
      >
        {connecting ? START_COPY.connecting : START_COPY.connect}
      </button>

      {error ? (
        <Notice variant="danger" title={START_COPY.errorTitle}>
          {error}
        </Notice>
      ) : null}

      <p className="text-xs text-textFaint">{START_COPY.hostKeyHint}</p>
    </form>
  );
}
