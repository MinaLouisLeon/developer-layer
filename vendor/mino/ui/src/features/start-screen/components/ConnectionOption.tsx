import type { ConnectionOptionId, ConnectionOptionModel } from "../types";

interface ConnectionOptionProps {
  option: ConnectionOptionModel;
  onSelect: (id: ConnectionOptionId) => void;
}

/**
 * One entry point on the start screen. Shared by the local and SSH options so
 * the two cannot drift apart, and so adding the remote-agent option later is
 * a data change rather than new markup.
 */
export function ConnectionOption({ option, onSelect }: ConnectionOptionProps) {
  return (
    <button
      type="button"
      aria-disabled={option.unavailable}
      onClick={() => onSelect(option.id)}
      className={`w-full rounded border px-4 py-3 text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-accentStrong ${
        option.unavailable
          ? "border-border bg-surface text-textFaint"
          : "border-borderStrong bg-surfaceRaised text-text hover:border-accent"
      }`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{option.title}</span>
        <span
          className={`shrink-0 text-xs ${
            option.unavailable ? "text-textFaint" : "text-accent"
          }`}
        >
          {option.actionLabel}
        </span>
      </span>
      <span className="mt-1 block text-xs text-textMuted">
        {option.description}
      </span>
    </button>
  );
}
