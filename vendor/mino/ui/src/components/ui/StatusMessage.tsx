import type { StatusMessageProps } from "./types";

const TONE_CLASSES = {
  info: "text-textMuted",
  warning: "text-warning",
  danger: "text-danger",
} as const;

/**
 * The empty, loading and error body of a pane. One component so "no folder
 * open", "loading" and "that failed" are laid out identically.
 */
export function StatusMessage({
  title,
  description,
  tone = "info",
}: StatusMessageProps) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center"
    >
      <p className={`text-sm font-medium ${TONE_CLASSES[tone]}`}>{title}</p>
      {description ? (
        <p className="max-w-md text-xs text-textFaint">{description}</p>
      ) : null}
    </div>
  );
}
