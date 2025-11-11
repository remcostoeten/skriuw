import { ChevronLeft, ArrowLeft, ArrowRight, Columns, Search, PanelLeftClose, Menu } from "lucide-react";

type props = {
  onToggleSidebar?: () => void;
};

export function TopToolbar({ onToggleSidebar }: props) {
  return (
    <div className="h-10 bg-Skriuw-dark border-b border-Skriuw-border flex items-center justify-between px-1.5">
      <div className="flex items-center gap-1.5">
        {/* Mobile menu button */}
        <button
          className="w-6 h-6 flex lg:hidden items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors"
          onClick={onToggleSidebar}
        >
          <Menu className="w-4 h-4 text-Skriuw-icon" />
        </button>

        {/* Desktop sidebar toggle */}
        <button className="w-6 h-6 hidden lg:flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors">
          <PanelLeftClose className="w-4 h-4 text-Skriuw-icon" />
        </button>

        <button className="w-6 h-6 flex items-center justify-center rounded-md opacity-50 hover:bg-Skriuw-border/50 transition-colors">
          <ArrowLeft className="w-4 h-4 text-Skriuw-icon" />
        </button>
        <button className="w-6 h-6 flex items-center justify-center rounded-md opacity-50 hover:bg-Skriuw-border/50 transition-colors">
          <ArrowRight className="w-4 h-4 text-Skriuw-icon" />
        </button>
      </div>

      <div className="flex items-center">
        <div className="px-1.5 py-1 rounded-md">
          <span className="text-[13px] text-Skriuw-text truncate max-w-[200px] sm:max-w-none">README.md</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button className="w-6 h-6 hidden sm:flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors">
          <Columns className="w-4 h-4 text-Skriuw-icon" />
        </button>
        <button className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors">
          <Search className="w-4 h-4 text-Skriuw-icon" />
        </button>
        <button className="w-6 h-6 hidden sm:flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors">
          <ChevronLeft className="w-4 h-4 text-Skriuw-icon" />
        </button>
      </div>
    </div>
  );
}
