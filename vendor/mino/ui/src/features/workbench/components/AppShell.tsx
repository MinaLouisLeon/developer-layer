import { StartScreen } from "@/features/start-screen/components/StartScreen";

import { useSessionContext } from "../context/SessionContext";
import { Workbench } from "./Workbench";

/** Start screen until a connection is open, the three panes afterwards. */
export function AppShell() {
  const { connection } = useSessionContext();
  return connection ? <Workbench /> : <StartScreen />;
}
