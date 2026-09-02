import type { GitBranch } from "@/Types";

/**
 * The branches the picker offers, split the way it shows them.
 *
 * Local and remote are separated here rather than in the component, because
 * "which list does this go in" is a question about `isRemote` and not about
 * layout - and a component that grouped them itself would be a second place
 * that decision lived.
 */
export interface BranchListModel {
  /** The branch HEAD is on, or `null` on a detached HEAD. */
  current: GitBranch | null;
  local: GitBranch[];
  remote: GitBranch[];
}

/**
 * A checkout held back because it would strand unsaved work.
 *
 * The highest-severity risk in this phase, modelled the way the discard
 * prompt is: asking and acting are two separate functions, so the transport
 * call is reachable from exactly one of them. Nothing here discards a draft -
 * the choices offered are to go back and save, or to switch and keep the
 * drafts in memory. Neither of them throws an edit away.
 */
export interface CheckoutPrompt {
  /** The branch a confirmed checkout will switch to. */
  name: string;
  /** Absolute paths of the files with edits that are not on disk. */
  unsaved: string[];
}

export interface BranchState {
  /** The picker's open state. Closed by default: it is a menu, not a list. */
  open: boolean;
  toggle: () => void;
  branches: BranchListModel;
  /** What the header strip shows when there is no branch list yet. */
  currentName: string | null;
  detached: boolean;
  loading: boolean;
  /** Non-null while a checkout or a create is in flight. */
  busy: boolean;
  error: string | null;
  /**
   * Switches to a branch - or *asks* first, when doing so would strand an
   * unsaved edit.
   *
   * Takes the whole branch rather than its name because a remote row means
   * something different from a local one: `git checkout origin/feature`
   * **detaches HEAD**, while `git checkout feature` creates a local branch
   * tracking it. Which of the two to send is a decision about `isRemote`, and
   * it belongs here rather than in a component.
   */
  checkout: (branch: GitBranch) => void;
  prompt: CheckoutPrompt | null;
  confirmCheckout: () => void;
  cancelCheckout: () => void;
  /** The create field's text, and the create-and-checkout action. */
  newName: string;
  setNewName: (name: string) => void;
  create: () => void;
}
