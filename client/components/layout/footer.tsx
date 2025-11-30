import { CloudOff, Globe, Zap, Upload } from "lucide-react";
import { useState, useMemo } from "react";
import { SidebarMenu } from "../sidebar-menu";
import { ThemeToggle } from "@/shared/ui/theme-toggle";
import { useSettingsContext } from "@/features/settings/settings-provider";

export function Footer() {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const { settings, updateSetting } = useSettingsContext();
  const currentTheme = settings.theme || 'dark';
  
  const isDark = useMemo(() => {
    if (currentTheme === 'dark') return true;
    if (currentTheme === 'light') return false;
    if (currentTheme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true; // default to dark
  }, [currentTheme]);

  const handleThemeToggle = (isDarkMode: boolean) => {
    updateSetting('theme', isDarkMode ? 'dark' : 'light');
  };

  return (
    <>
      <footer className="h-9 fixed bottom-0 left-0 right-0 bg-sidebar-background border-t border-border flex items-center justify-between px-1.5">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 flex items-center justify-center">
            <ThemeToggle
              size={24}
              isDark={isDark}
              onChange={handleThemeToggle}
            />
          </div>
          <button
            onClick={() => setActiveMenu("offline")}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-accent/50 transition-colors"
            aria-label="Offline mode"
          >
            <CloudOff className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveMenu("language")}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-accent/50 transition-colors"
            aria-label="Language settings"
          >
            <Globe className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => setActiveMenu("performance")}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-accent/50 transition-colors"
            aria-label="Performance settings"
          >
            <Zap className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => setActiveMenu("sync")}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-accent/50 transition-colors"
            aria-label="Sync settings"
          >
            <Upload className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </footer>

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
