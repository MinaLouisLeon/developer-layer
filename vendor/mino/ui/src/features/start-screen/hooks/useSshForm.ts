import { useCallback, useMemo, useState } from "react";

import type { ConnectionTarget } from "@/Types";
import { useSessionContext } from "@/features/workbench/context/SessionContext";

import { START_COPY } from "../messages";
import type { SshFieldModel, SshFormValues } from "../types";

const DEFAULT_PORT = "22";

const EMPTY: SshFormValues = {
  host: "",
  port: DEFAULT_PORT,
  user: "",
  identityPath: "",
};

/**
 * The fields, in tab order. Declared as data so the form renders one repeated
 * row rather than five hand-written ones.
 *
 * There is no password field, and that is not an oversight: the transport
 * authenticates with a key file or an agent, so nothing here ever holds a
 * secret. The identity hint says so.
 */
export const SSH_FIELDS: SshFieldModel[] = [
  { name: "host", label: "Host", placeholder: "example.com" },
  { name: "port", label: "Port", placeholder: DEFAULT_PORT, inputMode: "numeric" },
  { name: "user", label: "User", placeholder: "your-login" },
  {
    name: "identityPath",
    label: "Key file",
    placeholder: "~/.ssh/id_ed25519",
    hint: START_COPY.identityHint,
  },
];

export function useSshForm() {
  const { connect, status, error } = useSessionContext();
  const [values, setValues] = useState<SshFormValues>(EMPTY);
  const [invalid, setInvalid] = useState<string | null>(null);

  const update = useCallback((name: keyof SshFormValues, value: string) => {
    setInvalid(null);
    setValues((current) => ({ ...current, [name]: value }));
  }, []);

  // Only host and user are required: the port defaults, the key file is
  // optional, and the folder is not asked for here at all - remote paths are
  // not knowable before connecting, so it is chosen afterwards from a listing.
  const ready = useMemo(
    () => values.host.trim() !== "" && values.user.trim() !== "",
    [values.host, values.user],
  );

  const submit = useCallback(async () => {
    const port = Number(values.port.trim() || DEFAULT_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setInvalid(START_COPY.portInvalid);
      return;
    }
    setInvalid(null);
    const target: ConnectionTarget = {
      kind: "ssh",
      detail: {
        host: values.host.trim(),
        port,
        user: values.user.trim(),
        // Null roots the session at the remote home directory. The working
        // folder is chosen from the workbench once there is a listing to
        // choose from.
        root: null,
        // An empty box means "use the agent", which the transport reads as
        // `null` rather than as an empty path.
        identityPath: values.identityPath.trim() || null,
      },
    };
    await connect(target);
  }, [connect, values]);

  return {
    values,
    fields: SSH_FIELDS,
    update,
    submit,
    ready,
    connecting: status === "connecting",
    error: invalid ?? error,
  };
}
