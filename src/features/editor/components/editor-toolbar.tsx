import {
  ChevronLeft,
  ChevronRight,
  Code,
  FileText,
  PanelRight,
  Settings2,
  Sidebar,
  Type,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";

type Props = {
  fileName: string;
  breadcrumb?: string[];
  editorMode: "raw" | "block";
  isMobile?: boolean;
  onToggleSidebar: () => void;
  onToggleMetadata: () => void;
  onToggleEditorMode: () => void;
  onOpenSettings?: () => void;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
  canNavigatePrev?: boolean;
  canNavigateNext?: boolean;
};

export function EditorToolbar({
  fileName,
  breadcrumb,
  editorMode,
  isMobile = false,
  onToggleSidebar,
  onToggleMetadata,
  onToggleEditorMode,
  onOpenSettings,
  onNavigatePrev,
  onNavigateNext,
  canNavigatePrev = false,
  canNavigateNext = false,
}: Props) {
  const sidebarIconButtonClass =
    "pressable flex h-7 w-7 items-center justify-center rounded-md transition-all duration-200";
  const editorModeTitle = editorMode === "raw" ? "Switch to Block Note" : "Switch to Raw MDX";

  if (isMobile) {
    return (
      <div className="border-b border-border bg-card/88 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.85rem)] backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <div className="flex items-center gap-1 rounded-[1.35rem] border border-border bg-background/70 p-1 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
            <button
              onClick={onToggleSidebar}
              className="flex h-11 w-11 items-center justify-center rounded-2xl text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-[0.97]"
              title="Open notes"
            >
              <Sidebar className="h-[18px] w-[18px]" strokeWidth={1.7} />
            </button>
            <button
              onClick={onNavigatePrev}
              disabled={!canNavigatePrev}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-2xl transition-all active:scale-[0.97]",
                canNavigatePrev
                  ? "text-muted-foreground hover:bg-accent hover:text-foreground"
                  : "cursor-not-allowed text-muted-foreground/30",
              )}
              title="Previous file"
            >
              <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={1.7} />
            </button>
            <button
              onClick={onNavigateNext}
              disabled={!canNavigateNext}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-2xl transition-all active:scale-[0.97]",
                canNavigateNext
                  ? "text-muted-foreground hover:bg-accent hover:text-foreground"
                  : "cursor-not-allowed text-muted-foreground/30",
              )}
              title="Next file"
            >
              <ChevronRight className="h-[18px] w-[18px]" strokeWidth={1.7} />
            </button>
          </div>

          <div className="min-w-0 flex-1 rounded-[1.6rem] border border-border/60 bg-background/55 px-4 py-3 shadow-[0_12px_34px_rgba(0,0,0,0.16)]">
            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.26em] text-muted-foreground/70">
              <FileText className="h-3.5 w-3.5" strokeWidth={1.6} />
              <span>Current Note</span>
            </div>
            <div className="mt-1.5 truncate text-[15px] font-semibold tracking-[-0.02em] text-foreground">
              {fileName}
            </div>
            {breadcrumb && breadcrumb.length > 0 && (
              <div className="mt-1 truncate text-[12px] text-muted-foreground/75">
                {breadcrumb.join(" / ")}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onToggleEditorMode}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/70 text-muted-foreground shadow-[0_10px_30px_rgba(0,0,0,0.16)] transition-all hover:bg-accent hover:text-foreground active:scale-[0.97]"
              title={editorModeTitle}
            >
              {editorMode === "raw" ? (
                <Code className="h-[18px] w-[18px]" strokeWidth={1.7} />
              ) : (
                <Type className="h-[18px] w-[18px]" strokeWidth={1.7} />
              )}
            </button>
            <button
              onClick={onToggleMetadata}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/70 text-muted-foreground shadow-[0_10px_30px_rgba(0,0,0,0.16)] transition-all hover:bg-accent hover:text-foreground active:scale-[0.97]"
              title="Open note details"
            >
              <PanelRight className="h-[18px] w-[18px]" strokeWidth={1.7} />
            </button>
            <button
              onClick={onOpenSettings}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/70 text-muted-foreground shadow-[0_10px_30px_rgba(0,0,0,0.16)] transition-all hover:bg-accent hover:text-foreground active:scale-[0.97]"
              title="Open settings"
            >
              <Settings2 className="h-[18px] w-[18px]" strokeWidth={1.7} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border-b border-sidebar-border border-l bg-sidebar text-sidebar-foreground",
        "flex h-11 items-center px-3",
      )}
    >
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleSidebar}
          className={cn(
            sidebarIconButtonClass,
            "text-sidebar-foreground/58 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
          )}
          title="Toggle sidebar"
        >
          <Sidebar className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button
          onClick={onNavigatePrev}
          disabled={!canNavigatePrev}
          className={cn(
            sidebarIconButtonClass,
            canNavigatePrev
              ? "text-sidebar-foreground/58 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
              : "cursor-not-allowed text-sidebar-foreground/25",
          )}
          title="Previous file"
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button
          onClick={onNavigateNext}
          disabled={!canNavigateNext}
          className={cn(
            sidebarIconButtonClass,
            canNavigateNext
              ? "text-sidebar-foreground/58 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
              : "cursor-not-allowed text-sidebar-foreground/25",
          )}
          title="Next file"
        >
          <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* Center - filename */}
      <div className="flex flex-1 items-center justify-center gap-3 text-sm">
        {breadcrumb && breadcrumb.length > 0 && (
          <>
            {breadcrumb.map((part, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="text-sidebar-foreground/58">{part}</span>
                <ChevronRight className="w-3 h-3 text-sidebar-foreground/40" />
              </span>
            ))}
          </>
        )}
        <span
          className={cn(
            "font-medium text-sidebar-foreground/80",
            "max-w-[28rem] truncate",
          )}
        >
          {fileName}
        </span>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleEditorMode}
          className={cn(
            sidebarIconButtonClass,
            "w-auto gap-1 px-2.5 text-[11px]",
            "text-sidebar-foreground/58 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
          )}
          title={editorModeTitle}
        >
          {editorMode === "raw" ? (
            <>
              <Code className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>Raw MDX</span>
            </>
          ) : (
            <>
              <Type className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>Block Note</span>
            </>
          )}
        </button>
        <button
          onClick={onToggleMetadata}
          className={cn(
            sidebarIconButtonClass,
            "text-sidebar-foreground/58 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
          )}
          title="Toggle metadata"
        >
          <PanelRight className="w-4 h-4" strokeWidth={1.5} />
        </button>
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className={cn(
              sidebarIconButtonClass,
              "text-sidebar-foreground/58 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
            )}
            title="Open settings"
          >
            <Settings2 className="w-4 h-4" strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  );
}
