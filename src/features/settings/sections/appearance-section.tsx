"use client";

import { Check } from "lucide-react";
import { Switch } from "@/shared/ui/switch";
import { usePreferencesStore } from "@/features/settings/store";
import { cn } from "@/shared/lib/utils";
import {
  SectionHeader,
  Row,
  SettingsCard,
  GroupLabel,
} from "@/features/settings/components/settings-primitives";

const THEMES = [
  { id: "midnight" as const, label: "Midnight", swatch: "from-zinc-900 to-zinc-800" },
  { id: "graphite" as const, label: "Graphite", swatch: "from-neutral-800 to-neutral-700" },
  { id: "paper" as const, label: "Paper", swatch: "from-stone-100 to-stone-200" },
];

const ACCENTS = ["#a78bfa", "#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#f87171"];

export function AppearanceSection() {
  const appearance = usePreferencesStore((s) => s.appearance);
  const update = usePreferencesStore((s) => s.updateAppearancePreference);

  return (
    <>
      <SectionHeader
        title="Appearance"
        description="Make Skriuw feel like yours. Changes apply across the workspace."
      />

      <GroupLabel>THEME</GroupLabel>
      <div className="grid grid-cols-3 gap-3">
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => update("theme", t.id)}
            className={cn(
              "group rounded-lg border p-2 text-left transition-colors",
              appearance.theme === t.id
                ? "border-foreground/60 bg-accent/40"
                : "border-border/60 bg-card/30 hover:border-border",
            )}
          >
            <div
              className={cn(
                "h-20 rounded-md bg-gradient-to-br relative overflow-hidden",
                t.swatch,
              )}
            >
              <div className="absolute inset-x-2 top-2 h-1.5 rounded-full bg-white/20" />
              <div className="absolute inset-x-2 top-5 h-1 w-2/3 rounded-full bg-white/15" />
              <div className="absolute inset-x-2 bottom-2 h-1 w-1/2 rounded-full bg-white/10" />
            </div>
            <div className="mt-2 flex items-center justify-between px-0.5">
              <span className="text-xs font-medium">{t.label}</span>
              {appearance.theme === t.id && <Check className="size-3.5" />}
            </div>
          </button>
        ))}
      </div>

      <GroupLabel>ACCENT</GroupLabel>
      <div className="flex gap-2 rounded-lg border border-border/60 bg-card/40 p-3">
        {ACCENTS.map((c) => (
          <button
            key={c}
            onClick={() => update("accentColor", c)}
            className={cn(
              "size-7 rounded-full ring-offset-2 ring-offset-background transition-all",
              appearance.accentColor === c && "ring-2 ring-foreground/70",
            )}
            style={{ backgroundColor: c }}
            aria-label={c}
          />
        ))}
      </div>

      <GroupLabel>INTERFACE</GroupLabel>
      <SettingsCard>
        <Row title="Compact sidebar" description="Tighter spacing in the file tree.">
          <Switch
            checked={appearance.compactSidebar}
            onCheckedChange={(v) => update("compactSidebar", v)}
          />
        </Row>
        <Row title="Show line numbers" description="In the editor gutter.">
          <Switch
            checked={appearance.showLineNumbers}
            onCheckedChange={(v) => update("showLineNumbers", v)}
          />
        </Row>
        <Row title="Reduce motion" description="Minimize transitions and animations.">
          <Switch
            checked={appearance.reduceMotion}
            onCheckedChange={(v) => update("reduceMotion", v)}
          />
        </Row>
      </SettingsCard>
    </>
  );
}
