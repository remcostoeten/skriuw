import { Moon, CloudOff, Globe, Zap, Upload, Keyboard, Info } from "lucide-react";
import { useState } from "react";
import { SidebarMenu } from "../sidebar-menu";

type FooterProps = {
  onToggleShortcuts?: () => void;
  onToggleNoteInfo?: () => void;
};

export function Footer({ onToggleShortcuts, onToggleNoteInfo }: FooterProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  return (
    <>
      <div className="h-9 bg-Skriuw-darker border-t border-Skriuw-border flex items-center justify-between px-1.5">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveMenu("theme")}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors"
            aria-label="Theme settings"
          >
            <Moon className="w-4 h-4 text-Skriuw-icon" />
          </button>
          <button
            onClick={() => setActiveMenu("offline")}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors"
            aria-label="Offline mode"
          >
            <CloudOff className="w-4 h-4 text-Skriuw-icon" />
          </button>
          {onToggleShortcuts && (
            <button
              onClick={onToggleShortcuts}
              className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors"
              aria-label="Keyboard shortcuts"
            >
              <Keyboard className="w-4 h-4 text-Skriuw-icon" />
            </button>
          )}
          {onToggleNoteInfo && (
            <button
              onClick={onToggleNoteInfo}
              className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors"
              aria-label="Note information"
            >
              <Info className="w-4 h-4 text-Skriuw-icon" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveMenu("language")}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors"
            aria-label="Language settings"
          >
            <Globe className="w-4 h-4 text-Skriuw-icon" />
          </button>
          <button
            onClick={() => setActiveMenu("performance")}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors"
            aria-label="Performance settings"
          >
            <Zap className="w-4 h-4 text-Skriuw-icon" />
          </button>
          <button
            onClick={() => setActiveMenu("sync")}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors"
            aria-label="Sync settings"
          >
            <Upload className="w-4 h-4 text-Skriuw-icon" />
          </button>
        </div>
      </div>

      <SidebarMenu
        open={activeMenu === "theme"}
        onOpenChange={(open) => !open && setActiveMenu(null)}
        title="Theme Settings"
      />
      <SidebarMenu
        open={activeMenu === "offline"}
        onOpenChange={(open) => !open && setActiveMenu(null)}
        title="Offline Mode"
      />
      <SidebarMenu
        open={activeMenu === "language"}
        onOpenChange={(open) => !open && setActiveMenu(null)}
        title="Language Settings"
      />
      <SidebarMenu
        open={activeMenu === "performance"}
        onOpenChange={(open) => !open && setActiveMenu(null)}
        title="Performance Settings"
      />
      <SidebarMenu
        open={activeMenu === "sync"}
        onOpenChange={(open) => !open && setActiveMenu(null)}
        title="Sync Settings"
      />
    </>
  );
}
