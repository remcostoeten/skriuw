import {
  ChevronLeft,
  ChevronRight,
  Code,
  Loader2,
  PanelRight,
  PenTool,
  Settings2,
  Sidebar,
  Sparkles,
  SpellCheck,
  Type,
  Wand2,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

type Props = {
  fileName: string;
  breadcrumb?: string[];
  editorMode: "raw" | "block";
  isMobile?: boolean;
  onToggleSidebar: () => void;
  onToggleMetadata: () => void;
  onToggleEditorMode: () => void;
  canToggleEditorMode?: boolean;
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
  canToggleEditorMode = true,
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
  const hasAiActions = Boolean(
    onAiGenerateTitle || onAiSpellCheck || onAiContinueWriting,
  );
  const sidebarIconButtonClass =
    "pressable flex h-7 w-7 items-center justify-center border border-transparent transition-colors duration-200";
  const editorModeTitle = canToggleEditorMode
    ? editorMode === "raw"
      ? "Switch to Block Note"
      : "Switch to Raw MDX"
    : "MDX opens in raw source mode";

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
              aria-label="Open notes"
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
              aria-label="Previous file"
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
              aria-label="Next file"
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
              disabled={!canToggleEditorMode}
              className="flex h-11 w-11 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97] disabled:opacity-40"
              title={editorModeTitle}
              aria-label={editorModeTitle}
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
              aria-label="Open note details"
            >
              <PanelRight className="h-[18px] w-[18px]" strokeWidth={1.7} />
            </button>
            <button
              onClick={onOpenSettings}
              className="flex h-11 w-11 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97]"
              title="Open settings"
              aria-label="Open settings"
            >
              <Settings2 className="h-[18px] w-[18px]" strokeWidth={1.7} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const segmentBase =
    "inline-flex items-center gap-1 rounded-[5px] px-2 py-0.5 text-[11px] transition-colors";
  const segmentActive = "bg-sidebar-accent/70 text-sidebar-foreground";
  const segmentInactive =
    "text-sidebar-foreground/55 hover:text-sidebar-foreground";

  return (
    <div
      className={cn(
        "border-b border-l border-sidebar-border bg-sidebar text-sidebar-foreground",
        "flex h-11 items-center gap-1 pl-2 pr-3",
      )}
    >
      <button
        onClick={onToggleSidebar}
        className={cn(
          sidebarIconButtonClass,
          "text-sidebar-foreground/58 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
        )}
        title="Toggle sidebar"
        aria-label="Toggle sidebar"
      >
        <Sidebar className="h-4 w-4" strokeWidth={1.5} />
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
        aria-label="Previous file"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
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
        aria-label="Next file"
      >
        <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
      </button>

      <div className="ml-2 flex min-w-0 flex-1 items-center gap-1.5 text-xs">
        {breadcrumb && breadcrumb.length > 0 && (
          <>
            {breadcrumb.map((part, i) => (
              <span key={i} className="flex shrink-0 items-center gap-1.5">
                <span className="truncate text-sidebar-foreground/55">{part}</span>
                <span className="text-sidebar-foreground/30">/</span>
              </span>
            ))}
          </>
        )}
        <span className="truncate font-medium text-sidebar-foreground/85">
          {fileName}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {hasAiActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={anyAiLoading}
                className={cn(
                  sidebarIconButtonClass,
                  "text-sidebar-foreground/58 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                  anyAiLoading && "cursor-not-allowed opacity-50",
                )}
                title="AI actions"
                aria-label="AI actions"
              >
                {anyAiLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.6} />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={1.6} />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {onAiGenerateTitle && (
                <DropdownMenuItem
                  onSelect={onAiGenerateTitle}
                  disabled={anyAiLoading}
                  className="gap-2 text-xs"
                >
                  <Wand2 className="h-3.5 w-3.5 text-blue-400" strokeWidth={1.6} />
                  Generate title
                  {aiLoading?.generateTitle && (
                    <Loader2 className="ml-auto h-3 w-3 animate-spin" strokeWidth={1.6} />
                  )}
                </DropdownMenuItem>
              )}
              {onAiSpellCheck && (
                <DropdownMenuItem
                  onSelect={onAiSpellCheck}
                  disabled={anyAiLoading}
                  className="gap-2 text-xs"
                >
                  <SpellCheck className="h-3.5 w-3.5 text-green-400" strokeWidth={1.6} />
                  Spell check
                  {aiLoading?.spellCheck && (
                    <Loader2 className="ml-auto h-3 w-3 animate-spin" strokeWidth={1.6} />
                  )}
                </DropdownMenuItem>
              )}
              {onAiContinueWriting && (
                <DropdownMenuItem
                  onSelect={onAiContinueWriting}
                  disabled={anyAiLoading}
                  className="gap-2 text-xs"
                >
                  <PenTool className="h-3.5 w-3.5 text-purple-400" strokeWidth={1.6} />
                  Continue writing
                  {aiLoading?.continueWriting && (
                    <Loader2 className="ml-auto h-3 w-3 animate-spin" strokeWidth={1.6} />
                  )}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div
          className={cn(
            "inline-flex items-center rounded-md border border-sidebar-border/70 bg-sidebar-accent/20 p-0.5",
            !canToggleEditorMode && "opacity-50",
          )}
          role="group"
          aria-label="Editor mode"
        >
          <button
            onClick={editorMode === "raw" ? undefined : onToggleEditorMode}
            disabled={!canToggleEditorMode}
            aria-pressed={editorMode === "block"}
            className={cn(
              segmentBase,
              editorMode === "block" ? segmentActive : segmentInactive,
              !canToggleEditorMode && "cursor-not-allowed",
            )}
            title="Block Note"
          >
            <Type className="h-3 w-3" strokeWidth={1.6} />
            <span>Block</span>
          </button>
          <button
            onClick={editorMode === "block" ? onToggleEditorMode : undefined}
            disabled={!canToggleEditorMode && editorMode !== "raw"}
            aria-pressed={editorMode === "raw"}
            className={cn(
              segmentBase,
              editorMode === "raw" ? segmentActive : segmentInactive,
            )}
            title={editorModeTitle}
          >
            <Code className="h-3 w-3" strokeWidth={1.6} />
            <span>Raw</span>
          </button>
        </div>

        <div className="mx-0.5 h-5 w-px bg-sidebar-border/60" />

        <button
          onClick={onToggleMetadata}
          className={cn(
            sidebarIconButtonClass,
            "text-sidebar-foreground/58 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
          )}
          title="Toggle metadata"
          aria-label="Toggle metadata"
        >
          <PanelRight className="h-4 w-4" strokeWidth={1.5} />
        </button>
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className={cn(
              sidebarIconButtonClass,
              "text-sidebar-foreground/58 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
            )}
            title="Open settings"
            aria-label="Open settings"
          >
            <Settings2 className="h-4 w-4" strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  );
}
