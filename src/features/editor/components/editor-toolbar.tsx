import {
  ChevronLeft,
  ChevronRight,
  Code,
  Loader2,
  PanelRight,
  PenTool,
  Settings2,
  Sidebar,
  SpellCheck,
  Type,
  Wand2,
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
  aiLoading?: { generateTitle: boolean; spellCheck: boolean; continueWriting: boolean };
  onAiGenerateTitle?: () => void;
  onAiSpellCheck?: () => void;
  onAiContinueWriting?: () => void;
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
  aiLoading,
  onAiGenerateTitle,
  onAiSpellCheck,
  onAiContinueWriting,
}: Props) {
  const anyAiLoading = aiLoading
    ? aiLoading.generateTitle || aiLoading.spellCheck || aiLoading.continueWriting
    : false;
  const sidebarIconButtonClass =
    "pressable flex h-7 w-7 items-center justify-center border border-transparent transition-colors duration-200";
  const editorModeTitle = editorMode === "raw" ? "Switch to Block Note" : "Switch to Raw MDX";

  if (isMobile) {
    const mobileControlClass =
      "flex h-11 w-11 items-center justify-center border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground active:scale-[0.97]";

    return (
      <div className="border-b border-border bg-card px-3 pb-3 pt-[max(env(safe-area-inset-top),0.85rem)] sm:px-4">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="flex h-11 items-center gap-1 border border-border bg-background px-1">
            <button
              onClick={onToggleSidebar}
              className={mobileControlClass}
              title="Open notes"
            >
              <Sidebar className="h-[18px] w-[18px]" strokeWidth={1.7} />
            </button>
            <button
              onClick={onNavigatePrev}
              disabled={!canNavigatePrev}
              className={cn(
                mobileControlClass,
                !canNavigatePrev && "cursor-not-allowed text-muted-foreground/30",
              )}
              title="Previous file"
            >
              <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={1.7} />
            </button>
            <button
              onClick={onNavigateNext}
              disabled={!canNavigateNext}
              className={cn(
                mobileControlClass,
                !canNavigateNext && "cursor-not-allowed text-muted-foreground/30",
              )}
              title="Next file"
            >
              <ChevronRight className="h-[18px] w-[18px]" strokeWidth={1.7} />
            </button>
          </div>

          <div className="flex h-11 min-w-0 flex-1 items-center border border-border bg-background px-4">
            <div className="min-w-0">
              {breadcrumb && breadcrumb.length > 0 && (
                <div className="truncate text-[10px] text-muted-foreground/70">
                  {breadcrumb.join(" / ")}
                </div>
              )}
              <div className="truncate text-[15px] font-semibold tracking-[-0.02em] text-foreground">
                {fileName}
              </div>
            </div>
          </div>

          <div className="flex h-11 items-center gap-1.5 sm:gap-2">
            <button
              onClick={onToggleEditorMode}
              className="flex h-11 w-11 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97]"
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
              className="flex h-11 w-11 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97]"
              title="Open note details"
            >
              <PanelRight className="h-[18px] w-[18px]" strokeWidth={1.7} />
            </button>
            <button
              onClick={onOpenSettings}
              className="flex h-11 w-11 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97]"
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
        "flex h-11 items-center justify-between px-3",
      )}
    >
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleSidebar}
          className={cn(
            sidebarIconButtonClass,
            "text-sidebar-foreground/58 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
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
              ? "text-sidebar-foreground/58 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
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
              ? "text-sidebar-foreground/58 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
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
        {(onAiGenerateTitle || onAiSpellCheck || onAiContinueWriting) && (
          <div className="flex items-center gap-0.5 mr-1 border-r border-sidebar-border pr-2">
            {anyAiLoading && (
              <Loader2 className="h-3 w-3 animate-spin text-sidebar-foreground/40 mr-0.5" strokeWidth={1.5} />
            )}
            {onAiGenerateTitle && (
              <button
                onClick={onAiGenerateTitle}
                disabled={anyAiLoading}
                className={cn(
                  sidebarIconButtonClass,
                  "text-blue-400/70 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-blue-400",
                  anyAiLoading && "cursor-not-allowed opacity-40",
                )}
                title="Generate title with AI"
              >
                <Wand2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            )}
            {onAiSpellCheck && (
              <button
                onClick={onAiSpellCheck}
                disabled={anyAiLoading}
                className={cn(
                  sidebarIconButtonClass,
                  "text-green-400/70 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-green-400",
                  anyAiLoading && "cursor-not-allowed opacity-40",
                )}
                title="Spell check with AI"
              >
                <SpellCheck className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            )}
            {onAiContinueWriting && (
              <button
                onClick={onAiContinueWriting}
                disabled={anyAiLoading}
                className={cn(
                  sidebarIconButtonClass,
                  "text-purple-400/70 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-purple-400",
                  anyAiLoading && "cursor-not-allowed opacity-40",
                )}
                title="Continue writing with AI"
              >
                <PenTool className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            )}
          </div>
        )}
        <button
          onClick={onToggleEditorMode}
          className={cn(
            sidebarIconButtonClass,
            "w-auto gap-1 px-2.5 text-[11px]",
            "text-sidebar-foreground/58 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
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
            "text-sidebar-foreground/58 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
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
              "text-sidebar-foreground/58 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
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
