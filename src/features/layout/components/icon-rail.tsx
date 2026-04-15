import { FolderOpen, BookOpen, Settings } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/ui/tooltip";
import { AuthEntryPoint } from "@/features/auth/components/auth-entry-point";
import { RawLogo } from "@/shared/ui/logo";

interface IconRailProps {
  onOpenSettings: () => void;
}

export function IconRail({ onOpenSettings }: IconRailProps) {
  const pathname = usePathname();

  const navItems = [
    {
      href: "/",
      label: "Notes",
      isActive: pathname === "/",
      icon: FolderOpen,
    },
    {
      href: "/journal",
      label: "Journal",
      isActive: pathname === "/journal",
      icon: BookOpen,
    },
  ];

  const iconButtonClass =
    "pressable flex h-8 w-8 items-center justify-center rounded-2xl border transition-all duration-200";

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-14 flex-col items-center justify-between border-r border-sidebar-border bg-sidebar/95 py-6 backdrop-blur supports-[backdrop-filter]:bg-sidebar/85 md:flex">
        <div className="flex flex-col items-center gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <RawLogo variant="sidebar" size={22} className="-mt-0.5 mb-1 rounded-2xl border border-transparent p-1.5 transition-colors cursor-pointer hover:border-sidebar-border hover:bg-sidebar-accent/70" />
            </TooltipTrigger>
            <TooltipContent side="right">Skriuw</TooltipContent>
          </Tooltip>
          {navItems.map(({ href, label, isActive, icon: Icon }) => (
            <Tooltip key={href}>
              <TooltipTrigger asChild>
                <Link
                  href={href}
                  className={cn(
                    iconButtonClass,
                    isActive
                      ? "border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                      : "border-transparent text-sidebar-foreground/58 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                  )}
                  aria-label={label}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          ))}
        </div>

        <div className="flex flex-col items-center gap-2">
          <AuthEntryPoint triggerVariant="rail-avatar" />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onOpenSettings}
                className={cn(
                  iconButtonClass,
                  "group border-transparent text-sidebar-foreground/58 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                )}
                aria-label="Settings"
              >
                <Settings
                  className="h-[18px] w-[18px] transition-transform duration-200 group-hover:rotate-12"
                  strokeWidth={1.6}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Settings</TooltipContent>
          </Tooltip>
        </div>
      </aside>
      <div aria-hidden className="hidden w-14 shrink-0 md:block" />
    </>
  );
}
