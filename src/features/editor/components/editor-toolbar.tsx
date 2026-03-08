import { ChevronLeft, ChevronRight, Columns2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";

type Props = {
  fileName: string;
  breadcrumb?: string[];
  isMobile?: boolean;
  onToggleSidebar: () => void;
  onToggleMetadata: () => void;
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
  canNavigatePrev?: boolean;
  canNavigateNext?: boolean;
};

export function EditorToolbar({
  fileName,
  breadcrumb,
  isMobile = false,
  onToggleSidebar,
  onToggleMetadata,
  onNavigatePrev,
  onNavigateNext,
  canNavigatePrev = false,
  canNavigateNext = false,
}: Props) {
  return (
    <div
      className={cn(
        "border-b border-border bg-card/95 backdrop-blur-sm",
        isMobile
          ? "flex min-h-16 items-center gap-2 px-3 pb-2 pt-[max(env(safe-area-inset-top),0.75rem)]"
          : "flex h-11 items-center px-3",
      )}
    >
      {/* Left controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleSidebar}
          className={cn(
            "flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
            isMobile ? "h-11 w-11" : "h-7 w-7",
          )}
          title="Toggle sidebar"
        >
          <Columns2 className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button
          onClick={onNavigatePrev}
          disabled={!canNavigatePrev}
          className={cn(
            "flex items-center justify-center rounded-xl transition-colors",
            isMobile ? "h-11 w-11" : "h-7 w-7",
            canNavigatePrev
              ? "text-muted-foreground hover:text-foreground hover:bg-accent"
              : "text-muted-foreground/30 cursor-not-allowed",
          )}
          title="Previous file"
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button
          onClick={onNavigateNext}
          disabled={!canNavigateNext}
          className={cn(
            "flex items-center justify-center rounded-xl transition-colors",
            isMobile ? "h-11 w-11" : "h-7 w-7",
            canNavigateNext
              ? "text-muted-foreground hover:text-foreground hover:bg-accent"
              : "text-muted-foreground/30 cursor-not-allowed",
          )}
          title="Next file"
        >
          <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* Center - filename */}
      <div className={cn("flex flex-1 items-center justify-center gap-3 text-sm", isMobile && "min-w-0")}>
        {breadcrumb && breadcrumb.length > 0 && (
          <>
            {breadcrumb.map((part, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="text-muted-foreground">{part}</span>
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              </span>
            ))}
          </>
        )}
        <span
          className={cn(
            "font-medium text-foreground/80",
            isMobile ? "max-w-[10rem] truncate text-[13px]" : "max-w-[28rem] truncate",
          )}
        >
          {fileName}
        </span>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleMetadata}
          className={cn(
            "flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
            isMobile ? "h-11 w-11" : "h-7 w-7",
          )}
          title="Toggle metadata"
        >
          <Columns2 className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
