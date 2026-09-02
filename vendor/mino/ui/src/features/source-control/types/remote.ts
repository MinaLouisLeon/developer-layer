import type { ConflictResolution, GitConflict, GitRemote } from "@/Types";

/**
 * What the reader is being asked to confirm before a push.
 *
 * Modelled as state rather than a `window.confirm`, like the discard and stash
 * prompts, because the sentence has to name the branch and the remote and say
 * what the button will do - none of which a native confirm can be trusted to
 * render the same way twice.
 *
 * `force` is part of the prompt rather than a separate one, so there is
 * exactly one path to the transport and it is impossible to reach a force push
 * through the ordinary confirmation.
 */
export interface PushPrompt {
  remote: string;
  branch: string;
  force: boolean;
}

export interface RemoteState {
  /** Collapsed by default; the list is read when it is opened. */
  open: boolean;
  toggle: () => void;

  remotes: GitRemote[];
  /** The one the buttons act on. `null` when none is configured. */
  remote: string | null;
  /** The branch a push would send, from the status the panel already reads. */
  branch: string | null;

  /** True while any of the three is in flight. */
  busy: boolean;
  /** The last failure, kept until the next attempt. */
  error: string | null;
  /** What the last call did, shown briefly. */
  outcome: string | null;

  rebase: boolean;
  toggleRebase: () => void;

  fetch: () => void;
  pull: () => void;
  /** Opens the confirmation. Neither of these sends anything. */
  askPush: () => void;
  askForcePush: () => void;

  prompt: PushPrompt | null;
  confirmPush: () => void;
  cancelPush: () => void;
}

export interface ConflictsState {
  conflicts: GitConflict[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  resolve: (path: string, resolution: ConflictResolution) => void;
  /** Opens a conflicted file in the viewer, markers and all. */
  open: (conflict: GitConflict) => void;
}
