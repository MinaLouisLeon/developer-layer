import type { TransportError, TransportKind } from "@/Types";

import { formatBytes } from "./bytes";

/**
 * Every user-facing sentence for a transport failure lives here rather than in
 * a component, so the copy stays consistent and a future translation pass has
 * one file to reach for.
 */
const TRANSPORT_LABELS: Record<TransportKind, string> = {
  local: "Local",
  ssh: "SSH",
  remoteAgent: "Remote agent",
};

export function isTransportError(value: unknown): value is TransportError {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    typeof (value as { kind: unknown }).kind === "string"
  );
}

/** Normalises anything thrown across the IPC boundary into a typed error. */
export function toTransportError(value: unknown): TransportError {
  if (isTransportError(value)) return value;
  const message = value instanceof Error ? value.message : String(value);
  return { kind: "protocol", detail: { message } };
}

export function transportErrorMessage(error: TransportError): string {
  switch (error.kind) {
    case "unimplemented":
      return `${TRANSPORT_LABELS[error.detail.transport]} connections are not available in this build yet.`;
    case "notConnected":
      return "No folder is open yet. Choose a folder to get started.";
    case "notFound":
      return `That path is gone: ${error.detail.path}`;
    case "permissionDenied":
      return `You do not have permission to open ${error.detail.path}.`;
    case "pathEscapesRoot":
      return `${error.detail.path} sits outside the folder you opened, so it cannot be read.`;
    case "tooLarge":
      return `This file is ${formatBytes(error.detail.size)} and the viewer stops at ${formatBytes(
        error.detail.limit,
      )}. Open it in an external editor instead.`;
    case "binaryFile":
      return `This looks like a binary file (${formatBytes(error.detail.size)}), so it is not shown here.`;
    case "ptyNotFound":
      return "That terminal session has already closed. Reopen the folder to start a new one.";
    case "pty":
      return `The terminal stopped working: ${error.detail.message}`;
    case "shell":
      return `The shell reported a problem: ${error.detail.message}`;
    case "io":
      return `Could not read from disk: ${error.detail.message}`;
    case "protocol":
      return `Unexpected response from the transport: ${error.detail.message}`;
    case "timeout":
      return `${error.detail.operation} took longer than ${Math.round(
        error.detail.ms / 1000,
      )}s and was stopped.`;
    case "invalidArgument":
      return `That request was not valid: ${error.detail.message}`;
    default:
      return "Something went wrong. Try again.";
  }
}

/** Convenience for the many call sites that only need the sentence. */
export function describeFailure(value: unknown): string {
  return transportErrorMessage(toTransportError(value));
}
