import { FolderOpen, BookOpen, Sun, Moon, Settings } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface IconRailProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenSettings: () => void;
}

export function IconRail({ activeTab, onTabChange, onOpenSettings }: IconRailProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div className="native-panel w-12 flex flex-col items-center gap-1 border-r border-border py-3">
      {/* Notes/Folders tab */}
      <Link
        href="/"
        className={cn(
          "pressable flex h-9 w-9 items-center justify-center rounded-xl border border-transparent transition-colors",
          pathname === "/"
            ? "native-surface border-border/60 text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/65",
        )}
        title="Notes"
      >
        <FolderOpen className="w-[18px] h-[18px]" strokeWidth={1.5} />
      </Link>

      {/* Journal tab */}
      <Link
        href="/journal"
        className={cn(
          "pressable flex h-9 w-9 items-center justify-center rounded-xl border border-transparent transition-colors",
          pathname === "/journal"
            ? "native-surface border-border/60 text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/65",
        )}
        title="Journal"
      >
        <BookOpen className="w-[18px] h-[18px]" strokeWidth={1.5} />
      </Link>

      {/* Bottom icons - Settings and Theme toggle */}
      <div className="mt-auto flex flex-col gap-1">
        <button
          onClick={onOpenSettings}
          className="pressable flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent/65 hover:text-foreground"
          title="Settings"
        >
          <Settings className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </button>
        <button
          onClick={toggleTheme}
          className="pressable flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent/65 hover:text-foreground"
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
