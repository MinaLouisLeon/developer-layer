import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";

import type { TransportClient } from "@/Types";
import { createTransport } from "@/transport";

const TransportContext = createContext<TransportClient | null>(null);

interface TransportProviderProps {
  /** Injected by tests; production picks the client for the runtime. */
  client?: TransportClient;
  children: ReactNode;
}

/**
 * Puts one transport client in context. Panes take it from here and never
 * import a concrete implementation, which is what lets the same components
 * serve the desktop build and, later, the browser build.
 */
export function TransportProvider({ client, children }: TransportProviderProps) {
  const value = useMemo(() => client ?? createTransport(), [client]);
  return (
    <TransportContext.Provider value={value}>
      {children}
    </TransportContext.Provider>
  );
}

export function useTransport(): TransportClient {
  const client = useContext(TransportContext);
  if (!client) {
    throw new Error("useTransport must be used inside a TransportProvider");
  }
  return client;
}
