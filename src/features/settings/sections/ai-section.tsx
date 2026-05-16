"use client";

import dynamic from "next/dynamic";

const AiSettings = dynamic(
  () =>
    import("@/features/settings/components/ai-settings").then((mod) => ({
      default: mod.AiSettings,
    })),
  { ssr: false, loading: () => null },
);

export function AiSection() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">AI</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Bring-your-own-key configuration and usage diagnostics.
        </p>
      </div>
      <div className="border-t border-border" />
      <AiSettings />
    </div>
  );
}
