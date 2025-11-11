import { ReactNode, useEffect } from "react";
import { Sonner, Toaster, TooltipProvider } from "@ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initializeAppStorage } from "../storage";
import { SettingsProvider } from "@/shared/data/settings";

const queryClient = new QueryClient();

interface ProvidersProps {
  children: ReactNode;
}

function StorageInitializer({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Initialize storage when app starts
    initializeAppStorage().catch(error => {
      console.error("Failed to initialize storage:", error);
    });
  }, []);

  return <>{children}</>;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <StorageInitializer>
            {children}
          </StorageInitializer>
        </TooltipProvider>
      </SettingsProvider>
    </QueryClientProvider>
  );
}