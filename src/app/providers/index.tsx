import { ReactNode, useEffect, useState } from "react";
import { Sonner, Toaster, TooltipProvider } from "ui";
import { initializeAppStorage } from "../storage";
import { SettingsProvider } from "@/features/settings";
import { ShortcutProvider } from "@/features/shortcuts/global-shortcut-provider";
import { ContextMenuProvider } from "@/features/shortcuts/context-menu-context";
import { EmptyState } from "@/shared/ui/empty-state";
import { AlertCircle } from "lucide-react";

type props = {
  children: ReactNode;
}

function StorageInitializer({ children }: props) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
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
      <div className="flex-1 flex items-center justify-center min-h-screen bg-background">
        <EmptyState
          message="Storage initialization failed"
          submessage={error.message}
          icon={<AlertCircle className="h-8 w-8 text-destructive" />}
          actions={[
            {
              label: "Refresh page",
              onClick: () => window.location.reload(),
            },
          ]}
        />
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen bg-background">
        <EmptyState
          message="Initializing storage..."
          submessage="Please wait while we set up your workspace"
        />
      </div>
    );
  }

  return <>{children}</>;
}

export function Providers({ children }: props) {
  return (
    <SettingsProvider>
      <ShortcutProvider>
        <ContextMenuProvider>
          <TooltipProvider delayDuration={0}>
            <Toaster />
            <Sonner />
            <StorageInitializer>
              {children}
            </StorageInitializer>
          </TooltipProvider>
        </ContextMenuProvider>
      </ShortcutProvider>
    </SettingsProvider>
  );
}