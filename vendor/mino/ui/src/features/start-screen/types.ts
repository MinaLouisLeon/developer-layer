export type ConnectionOptionId = "local" | "ssh";

/** What the SSH form collects.
 *
 * Two deliberate omissions. There is no password or passphrase: the transport
 * authenticates with a key file or an SSH agent, so this app never holds a
 * secret and has nothing to persist. And there is no folder: remote paths are
 * not knowable before connecting, so the session opens at the account's home
 * directory and the working folder is chosen from a real listing afterwards. */
export interface SshFormValues {
  host: string;
  port: string;
  user: string;
  identityPath: string;
}

/** One labelled input in the SSH form. Grouped into an object because the row
 * is repeated and the rules cap a component at six props. */
export interface SshFieldModel {
  name: keyof SshFormValues;
  label: string;
  placeholder: string;
  hint?: string;
  inputMode?: "numeric";
}

export interface ConnectionOptionModel {
  id: ConnectionOptionId;
  title: string;
  description: string;
  actionLabel: string;
  /**
   * Rendered as unavailable but still focusable and still activatable, so the
   * option can say *why* it cannot be used. A truly `disabled` button could
   * not. SSH set this while the transport was a stub; it is implemented now,
   * so only a transport that is still declared-not-built sets it.
   */
  unavailable: boolean;
}
