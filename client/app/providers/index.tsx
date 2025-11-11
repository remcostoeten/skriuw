import { ReactNode, useEffect, useState } from "react";
import { Sonner, Toaster, TooltipProvider } from "@ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initializeAppStorage } from "../storage";
import { SettingsProvider } from "@/shared/data/settings";
import { ShortcutProvider } from "@/shared/shortcuts/global-shortcut-provider";

const queryClient = new QueryClient();

type props = {
  children: ReactNode;
}

function StorageInitializer({ children }: props) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Initialize storage when app starts
    initializeAppStorage()
      .then(() => {
        setIsInitialized(true);
        setError(null);
      })
      .catch((err) => {
        console.error("Failed to initialize storage:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsInitialized(false);
      });
  }, []);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen bg-Skriuw-dark">
        <div className="text-center">
          <p className="text-red-400 mb-2">Error: Storage adapter not initialized</p>
          <p className="text-Skriuw-text-muted mb-4">{error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-Skriuw-border text-Skriuw-text rounded-md hover:bg-Skriuw-border/80 transition-colors"
          >
            Please try refreshing the page
          </button>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen bg-Skriuw-dark">
        <div className="text-center">
          <p className="text-Skriuw-text-muted">Initializing storage...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function Providers({ children }: props) {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <ShortcutProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <StorageInitializer>
              {children}
            </StorageInitializer>
          </TooltipProvider>
        </ShortcutProvider>
      </SettingsProvider>
    </QueryClientProvider>
  );
}