import { ChevronLeft, ChevronRight, PanelLeftClose, PanelRightClose, Search, Eye, Edit } from "lucide-react";
import { useResponsiveOverride } from "@/hooks/use-responsive-override";
import { useNavigationHistory } from "@/hooks/use-navigation-history";
import { InDocumentSearch } from "@/components/in-document-search";
import { BlockNoteEditor } from "@blocknote/core";
import { useState } from "react";

type props = {
  noteName: string;
  onToggleSidebar: () => void;
  onToggleDesktopSidebar?: () => void;
  onToggleNoteSidebar?: () => void;
  editor?: BlockNoteEditor | null;
  isReadOnly?: boolean;
  onToggleReadOnly?: () => void;
};

export function TopToolbar({
  noteName,
  onToggleSidebar,
  onToggleDesktopSidebar,
  onToggleNoteSidebar,
  editor,
  isReadOnly = false,
  onToggleReadOnly,
}: props) {
  const { isMobile, isDesktop, isOverride } = useResponsiveOverride();
  const { canGoBack, canGoForward, goBack, goForward } = useNavigationHistory();
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  return (
    <div className="h-10 bg-Skriuw-dark border-b border-Skriuw-border flex items-center justify-between px-1.5">
      {/* Left side: Navigation arrows + Toggle left sidebar */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={goBack}
          disabled={!canGoBack}
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Go back"
        >
          <ChevronLeft className="w-4 h-4 text-Skriuw-icon" />
        </button>
        <button
          onClick={goForward}
          disabled={!canGoForward}
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Go forward"
        >
          <ChevronRight className="w-4 h-4 text-Skriuw-icon" />
        </button>
        
        {/* Mobile menu button - only show when actually on mobile and not overridden */}
        <button
          className={`w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors ${isMobile && !isOverride ? 'flex' : 'hidden'}`}
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          <PanelLeftClose className="w-4 h-4 text-Skriuw-icon" />
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

      {/* Middle: Title */}
      <div className="flex justify-center items-center flex-1 px-1.5 py-1 mx-1.5">
        <span className="text-[13px] text-Skriuw-text truncate max-w-[200px] sm:max-w-none">
          {noteName}
        </span>
      </div>

      {/* Right side: Edit/View toggle + Search + Toggle right sidebar */}
      <div className="flex items-center gap-1.5">
        {/* Edit/View mode toggle */}
        {onToggleReadOnly && (
          <button
            onClick={onToggleReadOnly}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors"
            aria-label={isReadOnly ? "Switch to edit mode" : "Switch to view mode"}
            title={isReadOnly ? "Switch to edit mode" : "Switch to view mode"}
          >
            {isReadOnly ? (
              <Eye className="w-4 h-4 text-Skriuw-icon" />
            ) : (
              <Edit className="w-4 h-4 text-Skriuw-icon" />
            )}
          </button>
        )}
        
        {/* In-document search */}
        {editor && (
          <>
            {!isSearchOpen && (
              <button
                onClick={() => setIsSearchOpen(true)}
                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors"
                aria-label="Search in document"
              >
                <Search className="w-4 h-4 text-Skriuw-icon" />
              </button>
            )}
            <InDocumentSearch
              editor={editor}
              isOpen={isSearchOpen}
              onClose={() => setIsSearchOpen(false)}
            />
          </>
        )}
        
        {/* Toggle right sidebar */}
        {onToggleNoteSidebar && (
          <button
            onClick={onToggleNoteSidebar}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors"
            aria-label="Toggle note sidebar"
          >
            <PanelRightClose className="w-4 h-4 text-Skriuw-icon" />
          </button>
        )}
      </div>
    </div>
  );
}