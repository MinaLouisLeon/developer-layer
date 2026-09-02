import type { ConnectionInfo, ConnectionTarget, DirEntry, ShellProbe } from "@/Types";

export type SessionStatus = "idle" | "connecting" | "connected" | "error";

export interface SessionState {
  status: SessionStatus;
  connection: ConnectionInfo | null;
  /**
   * The target this session was opened with, kept so the working folder can be
   * changed later without asking for the host and user again. Carries no
   * secret - the SSH variant holds a key *path* at most.
   */
  target: ConnectionTarget | null;
  /** Null until a session is open, or when the probe itself failed. */
  shellProbe: ShellProbe | null;
  error: string | null;
}

export interface SessionActions {
  connect: (target: ConnectionTarget) => Promise<void>;
  disconnect: () => Promise<void>;
  /** Re-roots the open session. On SSH the connection itself is reused. */
  changeFolder: (root: string) => Promise<void>;
}

export type SessionContextValue = SessionState & SessionActions;

export interface SelectionContextValue {
  selected: DirEntry | null;
  select: (entry: DirEntry | null) => void;
}

/** Percentages, summing to 100. Persisted across launches. */
export interface LayoutSizes {
  tree: number;
  viewer: number;
  terminal: number;
}
