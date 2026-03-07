import { FolderOpen, Sun, Moon, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

interface IconRailProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenSettings: () => void;
}

export function IconRail({ activeTab, onTabChange, onOpenSettings }: IconRailProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div className="w-12 flex flex-col items-center py-3 gap-1 bg-card border-r border-border">
      {/* Notes/Folders tab */}
      <button
        onClick={() => onTabChange("notes")}
        className={cn(
          "w-9 h-9 flex items-center justify-center rounded-md transition-colors",
          activeTab === "notes"
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent",
        )}
        title="Notes"
      >
        <FolderOpen className="w-[18px] h-[18px]" strokeWidth={1.5} />
      </button>

      {/* Bottom icons - Settings and Theme toggle */}
      <div className="mt-auto flex flex-col gap-1">
        <button
          onClick={onOpenSettings}
          className="w-9 h-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Settings"
        >
          <Settings className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </button>
        <button
          onClick={toggleTheme}
          className="w-9 h-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Toggle theme"
        >
          {mounted ? (
            theme === "dark" ? (
              <Sun className="w-[18px] h-[18px]" strokeWidth={1.5} />
            ) : (
              <Moon className="w-[18px] h-[18px]" strokeWidth={1.5} />
            )
          ) : (
            <Sun className="w-[18px] h-[18px]" strokeWidth={1.5} />
          )}
        </button>
      </div>
    </div>
  );
}
