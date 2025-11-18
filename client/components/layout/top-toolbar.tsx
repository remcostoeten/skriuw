import { Menu, PanelLeftClose, Search, Keyboard, Info } from "lucide-react";
import { useResponsiveOverride } from "@/hooks/use-responsive-override";

type props = {
  noteName: string;
  onToggleSidebar: () => void;
  onToggleDesktopSidebar?: () => void;
  onSearch?: (query: string) => void;
  onToggleShortcuts?: () => void;
  onToggleNoteSidebar?: () => void;
};

export function TopToolbar({
  noteName,
  onToggleSidebar,
  onToggleDesktopSidebar,
  onSearch,
  onToggleShortcuts,
  onToggleNoteSidebar,
}: props) {
  const { isMobile, isDesktop, isOverride } = useResponsiveOverride();

  return (
    <div className="h-10 bg-Skriuw-dark border-b border-Skriuw-border flex items-center justify-between px-1.5">
      <div className="flex items-center gap-1.5">
        {/* Mobile menu button - only show when actually on mobile and not overridden */}
        <button
          className={`w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors ${isMobile && !isOverride ? 'flex' : 'hidden'}`}
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          <Menu className="w-4 h-4 text-Skriuw-icon" />
        </button>

        {/* Desktop sidebar toggle button - show on desktop or when override is active */}
        <button
          className={`w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors ${isDesktop || isOverride ? 'flex' : 'hidden'}`}
          onClick={onToggleDesktopSidebar}
          aria-label="Toggle desktop sidebar"
        >
          <PanelLeftClose className="w-4 h-4 text-Skriuw-icon" />
        </button>
      </div>

      <div className="flex justify-center items-center flex-1 px-1.5 py-1 mx-1.5">
        <span className="text-[13px] text-Skriuw-text truncate max-w-[200px] sm:max-w-none">
          {noteName}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors"
          onClick={() => onSearch?.("")}
          aria-label="Search notes"
        >
          <Search className="w-4 h-4 text-Skriuw-icon" />
        </button>
        <button
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors"
          onClick={onToggleShortcuts}
          aria-label="Keyboard shortcuts"
        >
          <Keyboard className="w-4 h-4 text-Skriuw-icon" />
        </button>
        {onToggleNoteSidebar && (
          <button
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors"
            onClick={onToggleNoteSidebar}
            aria-label="Note information"
          >
            <Info className="w-4 h-4 text-Skriuw-icon" />
          </button>
        )}
      </div>
    </div>
  );
}