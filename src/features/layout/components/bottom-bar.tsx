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
      <div className="border-t border-border bg-card/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-xl items-center gap-2 rounded-[1.5rem] border border-border/70 bg-background/80 p-2 shadow-[0_12px_40px_rgba(0,0,0,0.28)]">
          <button
            onClick={toggleTheme}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Toggle theme"
          >
            {mounted && theme === "light" ? (
              <Moon className="h-4 w-4" strokeWidth={1.5} />
            ) : (
              <Sun className="h-4 w-4" strokeWidth={1.5} />
            )}
          </button>
          <button
            onClick={onToggleEditorMode}
            className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-accent px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/80"
            title={editorMode === "markdown" ? "Switch to Rich Text" : "Switch to Markdown"}
          >
            {editorMode === "markdown" ? (
              <>
                <Code className="h-4 w-4" strokeWidth={1.5} />
                <span>Markdown</span>
              </>
            ) : (
              <>
                <Type className="h-4 w-4" strokeWidth={1.5} />
                <span>Rich Text</span>
              </>
            )}
          </button>
          <button
            onClick={onOpenSettings}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Open settings"
          >
            <Settings2 className="h-4 w-4" strokeWidth={1.5} />
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
