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
  "flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors";

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
      <div className="relative border-t border-border/70 bg-card/82 px-3 pb-[calc(env(safe-area-inset-bottom)+0.85rem)] pt-3 backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-white/[0.04] to-transparent" />
        <div className="mx-auto grid max-w-xl grid-cols-3 gap-2 rounded-[1.8rem] border border-border/70 bg-background/78 p-2 shadow-[0_18px_44px_rgba(0,0,0,0.32)]">
          <button
            onClick={toggleTheme}
            className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-[1.35rem] text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-[0.97]"
            title="Toggle theme"
          >
            {mounted && theme === "light" ? (
              <Moon className="h-4 w-4" strokeWidth={1.7} />
            ) : (
              <Sun className="h-4 w-4" strokeWidth={1.7} />
            )}
            <span className="text-[11px] font-medium tracking-[0.02em]">Theme</span>
          </button>
          <button
            onClick={onToggleEditorMode}
            className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-[1.35rem] bg-accent px-4 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:bg-accent/80 active:scale-[0.97]"
            title={editorMode === "markdown" ? "Switch to Rich Text" : "Switch to Markdown"}
          >
            {editorMode === "markdown" ? (
              <>
                <Code className="h-4 w-4" strokeWidth={1.7} />
                <span className="text-[11px] font-semibold tracking-[0.02em]">Markdown</span>
              </>
            ) : (
              <>
                <Type className="h-4 w-4" strokeWidth={1.7} />
                <span className="text-[11px] font-semibold tracking-[0.02em]">Rich Text</span>
              </>
            )}
          </button>
          <button
            onClick={onOpenSettings}
            className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-[1.35rem] text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-[0.97]"
            title="Open settings"
          >
            <Settings2 className="h-4 w-4" strokeWidth={1.7} />
            <span className="text-[11px] font-medium tracking-[0.02em]">Settings</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-8 flex items-center justify-between px-3 bg-background border-t border-border">
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
          "flex items-center gap-1.5 px-2 py-0.5 text-[11px] rounded transition-colors",
          "text-muted-foreground hover:text-foreground hover:bg-accent",
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
