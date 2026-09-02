import type { NoticeProps, NoticeVariant } from "./types";

const VARIANT_CLASSES: Record<NoticeVariant, string> = {
  info: "border-border bg-surfaceRaised text-textMuted",
  warning: "border-warning bg-warningMuted text-warning",
  danger: "border-danger bg-dangerMuted text-danger",
};

const VARIANT_ROLES: Record<NoticeVariant, "status" | "alert"> = {
  info: "status",
  warning: "status",
  danger: "alert",
};

/**
 * A non-blocking banner. Used for the Nushell fallback notice, viewer guards
 * and transport failures, so all three read the same way.
 */
export function Notice({ variant, title, children }: NoticeProps) {
  return (
    <div
      role={VARIANT_ROLES[variant]}
      className={`rounded border px-3 py-2 text-sm ${VARIANT_CLASSES[variant]}`}
    >
      {title ? <p className="font-medium">{title}</p> : null}
      <p className={title ? "mt-0.5" : undefined}>{children}</p>
    </div>
  );
}
