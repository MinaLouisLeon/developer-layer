import { useId } from "react";

import type { SshFieldModel, SshFormValues } from "../types";

interface SshFieldProps {
  field: SshFieldModel;
  value: string;
  onChange: (name: keyof SshFormValues, value: string) => void;
  disabled: boolean;
}

/**
 * One labelled row of the SSH form. Repeated for every field, so the label,
 * hint and focus treatment are written once and cannot drift between rows.
 */
export function SshField({ field, value, onChange, disabled }: SshFieldProps) {
  const id = useId();
  const hintId = field.hint ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-textMuted">
        {field.label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        inputMode={field.inputMode}
        placeholder={field.placeholder}
        aria-describedby={hintId}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onChange(field.name, event.target.value)}
        className="rounded border border-border bg-surfaceSunken px-2 py-1.5 text-sm text-text placeholder:text-textFaint focus:outline-none focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accentStrong disabled:opacity-60"
      />
      {field.hint ? (
        <p id={hintId} className="text-xs text-textFaint">
          {field.hint}
        </p>
      ) : null}
    </div>
  );
}
