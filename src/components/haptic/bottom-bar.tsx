import { MessageSquare, Bell, Zap, ArrowUpRight, Share2, Code, Type } from "lucide-react";
import { cn } from "@/lib/utils";

type EditorMode = "markdown" | "richtext";

type Props = {
  editorMode: EditorMode;
  onToggleEditorMode: () => void;
};

const iconButtonClass =
  "w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors";

export function BottomBar({ editorMode, onToggleEditorMode }: Props) {
  return (
    <div className="h-8 flex items-center justify-between px-3 bg-background border-t border-border">
      <div className="flex items-center gap-1">
        <button className={iconButtonClass}>
          <MessageSquare className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
        <button className={iconButtonClass}>
          <Bell className="w-3.5 h-3.5" strokeWidth={1.5} />
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
        <button className={iconButtonClass}>
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </button>
        <button className={iconButtonClass}>
          <Zap className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
        <button className={iconButtonClass}>
          <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
        <button className={iconButtonClass}>
          <Share2 className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
