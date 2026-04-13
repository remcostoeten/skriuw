"use client";

import { Code, Settings2, Type } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";

type EditorMode = "raw" | "block";

type Props = {
  editorMode: EditorMode;
  onToggleEditorMode: () => void;
  isMobile?: boolean;
  onOpenSettings?: () => void;
};

const desktopIconButtonClass =
  "pressable flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/65 hover:text-foreground";

export function BottomBar({
  editorMode,
  onToggleEditorMode,
  isMobile = false,
  onOpenSettings,
}: Props) {
  if (isMobile) {
    return (
      <div className="relative border-t border-border/60 bg-background px-3 pb-[calc(env(safe-area-inset-bottom)+0.85rem)] pt-2.5">
        <div className="mx-auto grid max-w-xl grid-cols-2 gap-2">
          <button
            onClick={() => {
              triggerNativeFeedback("impact");
              onToggleEditorMode();
            }}
            className="pressable flex min-h-[58px] min-w-0 flex-col justify-between rounded-xl border border-foreground/15 bg-foreground px-4 py-2.5 text-background transition-all hover:opacity-95"
            title={editorMode === "raw" ? "Switch to Block Note" : "Switch to Raw MDX"}
          >
            <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-background/55">
              Editor
            </span>
            {editorMode === "raw" ? (
              <span className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-semibold tracking-[0.06em]">Raw MDX</span>
                <Code className="h-4 w-4" strokeWidth={1.7} />
              </span>
            ) : (
              <span className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-semibold tracking-[0.06em]">Block Note</span>
                <Type className="h-4 w-4" strokeWidth={1.7} />
              </span>
            )}
          </button>
          <button
            onClick={() => {
              triggerNativeFeedback("selection");
              onOpenSettings?.();
            }}
            className="pressable group flex min-h-[58px] min-w-0 flex-col justify-between rounded-xl border border-border/65 bg-card px-3 py-2.5 text-left text-muted-foreground transition-all hover:border-border hover:text-foreground"
            title="Open settings"
          >
            <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/70 transition-colors group-hover:text-foreground/65">
              System
            </span>
            <span className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium tracking-[0.04em]">Settings</span>
              <Settings2 className="h-4 w-4" strokeWidth={1.7} />
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-8 items-center justify-between border-t border-border bg-background px-3">
      <div className="min-w-[28px]" />
      <button
        onClick={onToggleEditorMode}
        className={cn(
          "pressable flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[11px] transition-colors",
          "text-muted-foreground hover:bg-accent/65 hover:text-foreground",
        )}
        title={editorMode === "raw" ? "Switch to Block Note" : "Switch to Raw MDX"}
      >
        {editorMode === "raw" ? (
          <>
            <Code className="w-3 h-3" strokeWidth={1.5} />
            <span>Raw MDX</span>
          </>
        ) : (
          <>
            <Type className="w-3 h-3" strokeWidth={1.5} />
            <span>Block Note</span>
          </>
        )}
      </button>
      <div className="flex items-center gap-1">
        <button className={desktopIconButtonClass} onClick={onOpenSettings} title="Open settings">
          <Settings2 className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
