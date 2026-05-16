"use client";

import { Button } from "@/shared/ui/button";
import { SectionHeader } from "@/features/settings/components/settings-primitives";

const INTEGRATIONS = [
  { name: "GitHub", desc: "Sync notes with a repo" },
  { name: "Linear", desc: "Turn notes into issues" },
  { name: "Slack", desc: "Send daily digest to a channel" },
  { name: "Raycast", desc: "Quick capture with hotkey" },
];

export function IntegrationsSection() {
  return (
    <>
      <SectionHeader
        title="Integrations"
        description="Connect Skriuw to the tools you already use."
      />
      <div className="grid gap-3">
        {INTEGRATIONS.map((item) => (
          <div
            key={item.name}
            className="flex items-center gap-4 rounded-lg border border-border/60 bg-card/40 p-4 opacity-60"
          >
            <div className="size-9 rounded-md bg-accent grid place-items-center text-sm font-semibold text-accent-foreground">
              {item.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{item.name}</div>
              <div className="text-xs text-muted-foreground">{item.desc}</div>
            </div>
            <Button size="sm" disabled title={`${item.name} integration is not yet available`}>
              Connect
            </Button>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground/60 px-1">
        Integrations are coming soon.
      </p>
    </>
  );
}
