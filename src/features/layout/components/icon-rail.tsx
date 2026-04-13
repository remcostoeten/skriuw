import { FolderOpen, BookOpen, Settings } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthEntryPoint } from "@/features/auth/components/auth-entry-point";

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
    "pressable flex h-7 w-7 items-center justify-center rounded-md transition-all duration-200";

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-12 flex-col items-center justify-between border-r border-sidebar-border bg-sidebar/95 py-6 backdrop-blur supports-[backdrop-filter]:bg-sidebar/85 md:flex">
        <div className="flex flex-col items-center gap-2">
          {navItems.map(({ href, label, isActive, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                iconButtonClass,
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  : "text-sidebar-foreground/58 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
              )}
              title={label}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
            </Link>
          ))}
        </div>

        <div className="flex flex-col items-center gap-2">
          <AuthEntryPoint triggerVariant="rail-avatar" />
          <button
            onClick={onOpenSettings}
            className={cn(
              iconButtonClass,
              "group text-sidebar-foreground/58 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
            )}
            title="Settings"
            aria-label="Settings"
          >
            <Settings
              className="h-[18px] w-[18px] transition-transform duration-200 group-hover:rotate-12"
              strokeWidth={1.6}
            />
          </button>
        </div>
      </aside>
      <div aria-hidden className="hidden w-12 shrink-0 md:block" />
    </>
  );
}
