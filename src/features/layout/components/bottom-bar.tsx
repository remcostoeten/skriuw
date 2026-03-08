"use client";

import { Code, Settings2, Sun, Moon, Type } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

type EditorMode = "markdown" | "richtext";

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
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  if (isMobile) {
    return (
      <div className="native-panel relative border-t border-border/60 px-3 pb-[calc(env(safe-area-inset-bottom)+0.85rem)] pt-2.5">
        <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-foreground/12 to-transparent" />
        <div className="pointer-events-none absolute inset-x-8 top-0 h-14 bg-gradient-to-b from-white/[0.035] to-transparent" />
        <div className="mx-auto grid max-w-xl grid-cols-[0.95fr_1.3fr_0.95fr] gap-2">
          <button
            onClick={toggleTheme}
            className="pressable native-surface group flex min-h-[58px] min-w-0 flex-col justify-between rounded-xl border border-border/65 px-3 py-2.5 text-left text-muted-foreground transition-all hover:border-border hover:text-foreground"
            title="Toggle theme"
          >
            <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/70 transition-colors group-hover:text-foreground/65">
              Theme
            </span>
            <span className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium tracking-[0.04em]">
                {mounted && theme === "light" ? "Night" : "Light"}
              </span>
              {mounted && theme === "light" ? (
                <Moon className="h-4 w-4" strokeWidth={1.7} />
              ) : (
                <Sun className="h-4 w-4" strokeWidth={1.7} />
              )}
            </span>
          </button>
          <button
            onClick={onToggleEditorMode}
            className="pressable relative flex min-h-[58px] min-w-0 flex-col justify-between overflow-hidden rounded-xl border border-foreground/15 bg-foreground px-4 py-2.5 text-background shadow-[0_14px_30px_rgba(0,0,0,0.28)] transition-all hover:opacity-95"
            title={editorMode === "markdown" ? "Switch to Rich Text" : "Switch to Markdown"}
          >
            <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/30" />
            <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-background/55">
              Editor
            </span>
            {editorMode === "markdown" ? (
              <span className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-semibold tracking-[0.06em]">Markdown</span>
                <Code className="h-4 w-4" strokeWidth={1.7} />
              </span>
            ) : (
              <span className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-semibold tracking-[0.06em]">Rich Text</span>
                <Type className="h-4 w-4" strokeWidth={1.7} />
              </span>
            )}
          </button>
          <button
            onClick={onOpenSettings}
            className="pressable native-surface group flex min-h-[58px] min-w-0 flex-col justify-between rounded-xl border border-border/65 px-3 py-2.5 text-left text-muted-foreground transition-all hover:border-border hover:text-foreground"
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
    <div className="native-panel flex h-8 items-center justify-between border-t border-border px-3">
      <div className="flex items-center gap-1">
        <button className={desktopIconButtonClass} onClick={toggleTheme} title="Toggle theme">
          {mounted && theme === "light" ? (
            <Moon className="w-3.5 h-3.5" strokeWidth={1.5} />
          ) : (
            <Sun className="w-3.5 h-3.5" strokeWidth={1.5} />
          )}
        </button>
      </div>
      <button
        onClick={onToggleEditorMode}
        className={cn(
          "pressable flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[11px] transition-colors",
          "text-muted-foreground hover:bg-accent/65 hover:text-foreground",
        )}
        title={editorMode === "markdown" ? "Switch to Rich Text" : "Switch to Markdown"}
      >
        {editorMode === "markdown" ? (
          <>
            <Code className="w-3 h-3" strokeWidth={1.5} />
            <span>Markdown</span>
          </>
        ) : (
          <>
            <Type className="w-3 h-3" strokeWidth={1.5} />
            <span>Rich Text</span>
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
