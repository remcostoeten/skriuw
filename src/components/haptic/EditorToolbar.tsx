import { ChevronLeft, ChevronRight, Columns2, ZoomIn, Maximize } from 'lucide-react';
import { cn } from '@/lib/utils';

export type EditorMode = 'markdown' | 'richtext';

type Props = {
  fileName: string;
  breadcrumb?: string[];
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
  onToggleSidebar, 
  onToggleMetadata,
  onNavigatePrev,
  onNavigateNext,
  canNavigatePrev = false,
  canNavigateNext = false,
}: Props) {
  return (
    <div className="h-11 flex items-center px-3 border-b border-border bg-card">
      {/* Left controls */}
      <div className="flex items-center gap-0.5">
        <button 
          onClick={onToggleSidebar}
          className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Columns2 className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button 
          onClick={onNavigatePrev}
          disabled={!canNavigatePrev}
          className={cn(
            "w-7 h-7 flex items-center justify-center rounded transition-colors",
            canNavigatePrev 
              ? "text-muted-foreground hover:text-foreground hover:bg-accent" 
              : "text-muted-foreground/30 cursor-not-allowed"
          )}
          title="Previous file"
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button 
          onClick={onNavigateNext}
          disabled={!canNavigateNext}
          className={cn(
            "w-7 h-7 flex items-center justify-center rounded transition-colors",
            canNavigateNext 
              ? "text-muted-foreground hover:text-foreground hover:bg-accent" 
              : "text-muted-foreground/30 cursor-not-allowed"
          )}
          title="Next file"
        >
          <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* Center - filename */}
      <div className="flex-1 flex items-center justify-center gap-3 text-sm">
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
        <span className="text-foreground/80 font-medium">{fileName}</span>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-0.5">
        <button className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
          <Maximize className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
          <ZoomIn className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button 
          onClick={onToggleMetadata}
          className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Columns2 className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
