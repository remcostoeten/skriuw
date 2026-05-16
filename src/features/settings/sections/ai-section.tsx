"use client";

import dynamic from "next/dynamic";
import { useAuthSnapshot } from "@/platform/auth/use-auth";

const AiSettings = dynamic(
  () =>
    import("@/features/settings/components/ai-settings").then((mod) => ({
      default: mod.AiSettings,
    })),
  { ssr: false, loading: () => null },
);

const AiKeysManager = dynamic(
  () =>
    import("@/features/settings/components/ai/ai-keys-manager").then((mod) => ({
      default: mod.AiKeysManager,
    })),
  { ssr: false, loading: () => null },
);

export function AiSection() {
  const auth = useAuthSnapshot();
  const isSignedIn = auth.phase === "authenticated" && auth.user !== null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-foreground">AI</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Bring-your-own-key configuration and usage diagnostics.
        </p>
      </div>
      <div className="border-t border-border" />
      <AiKeysManager isSignedIn={isSignedIn} />
      <div className="border-t border-border" />
      <AiSettings />
    </div>
  );
}
