import type {
  DirEntry,
  FilePayload,
  PtySession,
  ShellProbe,
  StructuredOutput,
  TransportError,
} from "@/Types";

import type { FakeGitOptions } from "./fake-git";
import type { FakeGitHubOptions } from "./fake-github";

/**
 * Everything a test can configure about the fake transport, in one place.
 *
 * Declared here rather than beside `createFakeTransport` because it is the
 * union of five surfaces' option types, and because that union is what a test
 * author actually reads - the factory below it is wiring.
 *
 * `failures` is keyed by method name (`listDir:/root`, `git.push`,
 * `github.probe`, …) so one map covers every surface. That is deliberate: a
 * test usually cares that *something* failed, and having to remember which of
 * five maps to put it in would be five things to get wrong.
 */
export interface FakeTransportOptions extends FakeGitOptions, FakeGitHubOptions {
  listings?: Record<string, DirEntry[]>;
  files?: Record<string, FilePayload>;
  failures?: Record<string, TransportError>;
  shellProbe?: ShellProbe;
  session?: Partial<PtySession>;
  structured?: StructuredOutput;
  /** Paths the search walk would find, relative to the root. */
  searchable?: string[];
}
