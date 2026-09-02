import { useCallback, useState } from "react";

import { useSessionContext } from "@/features/workbench/context/SessionContext";
import { chooseLocalFolder } from "@/lib/folderDialog";
import { describeFailure } from "@/lib/transportError";

import { START_COPY } from "../messages";
import type { ConnectionOptionId, ConnectionOptionModel } from "../types";

export const CONNECTION_OPTIONS: ConnectionOptionModel[] = [
  {
    id: "local",
    title: "Open a local folder",
    description:
      "Browse this machine. The workbench stays inside the folder you pick.",
    actionLabel: "Choose folder",
    unavailable: false,
  },
  {
    id: "ssh",
    title: "Connect over SSH",
    description:
      "Work on a remote host. Authenticates with a key file or your SSH agent.",
    actionLabel: "Set up",
    unavailable: false,
  },
];

export function useConnectionOptions() {
  const { connect, status, error } = useSessionContext();
  const [pickerError, setPickerError] = useState<string | null>(null);
  // SSH needs five values before it can dial, so selecting it opens a form
  // rather than connecting. Local needs only the folder the picker returns.
  const [showSshForm, setShowSshForm] = useState(false);

  const openLocal = useCallback(async () => {
    setPickerError(null);
    try {
      const choice = await chooseLocalFolder("Choose a folder to open");
      // The picker is a desktop capability, so in a browser tab there is no
      // runtime to answer it. Say that rather than letting the missing IPC
      // surface as a type error.
      if (choice.kind === "unavailable") {
        setPickerError(START_COPY.pickerNeedsDesktop);
        return;
      }
      // Cancelling is not an error.
      if (choice.kind === "cancelled") return;
      await connect({ kind: "local", detail: { root: choice.path } });
    } catch (failure) {
      setPickerError(describeFailure(failure));
    }
  }, [connect]);

  const select = useCallback(
    (id: ConnectionOptionId) => {
      if (id === "local") {
        void openLocal();
        return;
      }
      setPickerError(null);
      setShowSshForm(true);
    },
    [openLocal],
  );

  const closeSshForm = useCallback(() => setShowSshForm(false), []);

  return {
    options: CONNECTION_OPTIONS,
    select,
    showSshForm,
    closeSshForm,
    connecting: status === "connecting",
    // The SSH form shows its own failures, so the option list does not repeat
    // them underneath.
    error: showSshForm ? null : (pickerError ?? error),
  };
}
