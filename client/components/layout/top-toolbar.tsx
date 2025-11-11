import { Menu, PanelLeftClose, Search, Keyboard } from "lucide-react";

type props = {
  noteName: string;
  onToggleSidebar: () => void;
  onToggleDesktopSidebar?: () => void;
  onSearch?: (query: string) => void;
  onToggleShortcuts?: () => void;
};

export function TopToolbar({
  noteName,
  onToggleSidebar,
  onToggleDesktopSidebar,
  onSearch,
  onToggleShortcuts,
}: props) {
  return (
    <div className="h-10 bg-Skriuw-dark border-b border-Skriuw-border flex items-center justify-between px-1.5">
      <div className="flex items-center gap-1.5">
        <button
          className="w-6 h-6 flex lg:hidden items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          <Menu className="w-4 h-4 text-Skriuw-icon" />
        </button>

        <button
          className="w-6 h-6 hidden lg:flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors"
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
      </div>
    </div>
  );
}