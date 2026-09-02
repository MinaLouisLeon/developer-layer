import type { ReactNode } from "react";

/** Shared prop shapes for the presentational components in this folder. */
export type NoticeVariant = "info" | "warning" | "danger";

export interface NoticeProps {
  variant: NoticeVariant;
  title?: string;
  children: ReactNode;
}

export interface PaneProps {
  title: string;
  /** Rendered on the right of the header: breadcrumb, status, actions. */
  accessory?: ReactNode;
  children: ReactNode;
}

export interface StatusMessageProps {
  title: string;
  description?: string;
  tone?: NoticeVariant;
}
