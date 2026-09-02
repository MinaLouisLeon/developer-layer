import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import { useSession } from "../hooks/useSession";
import type { SessionContextValue } from "../types";

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext(): SessionContextValue {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error("useSessionContext must be used inside a SessionProvider");
  }
  return session;
}
