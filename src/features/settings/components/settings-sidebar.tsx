"use client";

import {
  Bell,
  Database,
  FlaskConical,
  Palette,
  PenLine,
  Plug,
  Shield,
  Sparkles,
  Tag,
  User,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";

export type SettingsTabId =
  | "account"
  | "appearance"
  | "editor"
  | "notifications"
  | "data"
  | "integrations"
  | "security"
  | "ai"
  | "tags"
  | "experimental";

type SettingsNavItem = {
  id: SettingsTabId;
  label: string;
  icon: LucideIcon;
};

const NAV_ITEMS: ReadonlyArray<SettingsNavItem> = [
  { id: "account", label: "Account", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "editor", label: "Editor", icon: PenLine },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "data", label: "Data & sync", icon: Database },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "security", label: "Security", icon: Shield },
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "tags", label: "Tags", icon: Tag },
  { id: "experimental", label: "Experimental", icon: FlaskConical },
];

type SettingsSidebarProps = {
  activeTab: SettingsTabId;
  onSelectTab: (tab: SettingsTabId) => void;
  className?: string;
};

export function SettingsSidebar({ activeTab, onSelectTab, className }: SettingsSidebarProps) {
  return (
    <div
      className={cn(
        "flex h-full w-full shrink-0 flex-col border-r border-border bg-background",
        className,
      )}
    >
      <div className="flex h-11 items-center border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground">
        <h2 className="text-sm font-semibold text-foreground">Settings</h2>
      </div>

      <nav
        aria-label="Settings sections"
        className="flex-1 overflow-y-auto p-2"
      >
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = item.id === activeTab;
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2 border border-transparent px-2.5 py-2 text-left text-[12px] font-medium transition-colors",
                    isActive
                      ? "border-border bg-muted text-foreground"
                      : "text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
                  <span className="truncate">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
