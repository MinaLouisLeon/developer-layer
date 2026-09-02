import { useCallback, useState } from "react";

import { chooseLocalFolder } from "@/lib/folderDialog";

import { useSessionContext } from "../context/SessionContext";
import { WORKBENCH_COPY } from "../messages";
import type { useFolderPicker } from "./useFolderPicker";

/**
 * Decides *how* to ask for a folder, which depends on where the files are.
 *
 * A local session gets the operating system's dialog. A remote one cannot:
 * that dialog browses the machine the app runs on, not the host the session is
 * open to, so it gets the in-app listing instead.
 */
export function useChangeFolder(picker: ReturnType<typeof useFolderPicker>) {
  const { connection, changeFolder } = useSessionContext();
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async () => {
    setError(null);
    if (connection?.kind !== "local") {
      picker.show();
      return;
    }

    const choice = await chooseLocalFolder(WORKBENCH_COPY.pickerTitle);
    if (choice.kind === "unavailable") {
      setError(WORKBENCH_COPY.pickerNeedsDesktop);
      return;
    }
    // Cancelling is not an error and leaves the session exactly as it was.
    if (choice.kind === "cancelled") return;
    await changeFolder(choice.path);
  }, [connection?.kind, picker, changeFolder]);

  return { request, error };
}
