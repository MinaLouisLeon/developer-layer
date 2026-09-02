import type { TransportClient } from "@/Types";
import { TransportProvider } from "@/context/TransportContext";
import { AppShell } from "@/features/workbench/components/AppShell";
import { SelectionProvider } from "@/features/workbench/context/SelectionContext";
import { SessionProvider } from "@/features/workbench/context/SessionContext";

interface AppProps {
  /** Test seam: a fake transport client stands in for the real one. */
  client?: TransportClient;
}

export function App({ client }: AppProps) {
  return (
    <TransportProvider client={client}>
      <SessionProvider>
        <SelectionProvider>
          <AppShell />
        </SelectionProvider>
      </SessionProvider>
    </TransportProvider>
  );
}
