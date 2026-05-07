import {
  FolderOpen,
  BookOpen,
  Settings,
  LogOut,
  LoaderCircle,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/ui/tooltip";
import { RawLogo } from "@/shared/ui/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { AuthEntryPoint } from "@/features/auth/components/auth-entry-point";
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import { signOut } from "@/platform/auth";
import { getAvatarSeed } from "@/shared/lib/avatar";
import { AvatarFace } from "@/shared/ui/avatar-face";
import { usePreferencesStore } from "@/features/settings/store";
import { ProfileMenuPanel } from "@/features/profile";

interface IconRailProps {
  onOpenSettings: () => void;
}

export function IconRail({ onOpenSettings }: IconRailProps) {
  const pathname = usePathname();
  const auth = useAuthSnapshot();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const avatarColor = usePreferencesStore((state) => state.profile.avatarColor);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  const avatarSeed = getAvatarSeed(
    auth.user?.email || auth.user?.name || auth.user?.id,
    "workspace-user",
  );

  const navItems = [
    {
      href: "/app",
      label: "Notes",
      isActive: pathname === "/app",
      icon: FolderOpen,
    },
    {
      href: "/app/journal",
      label: "Journal",
      isActive: pathname === "/app/journal",
      icon: BookOpen,
    },
  ];

  const iconButtonClass =
    "pressable relative flex h-9 w-9 items-center justify-center rounded-lg border transition-all duration-200";

  return (
    <>
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-14 flex-col
      items-center justify-between border-r border-sidebar-border bg-sidebar/95
      backdrop-blur supports-[backdrop-filter]:bg-sidebar/85 md:flex"
      >
        {" "}
        <div className="flex w-full flex-col items-center">
          {" "}
          <div
            className="flex h-11
      w-full items-center justify-center border-b border-sidebar-border"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <RawLogo
                  variant="sidebar"
                  size={34}
                  className="rounded-2xl border border-transparent p-1.5 text-sidebar-foreground/92 transition-all cursor-pointer hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                />
              </TooltipTrigger>
              <TooltipContent side="right">Skriuw</TooltipContent>
            </Tooltip>
          </div>
          <div className="mt-4 flex w-full flex-col items-center gap-4">
            {navItems.map(({ href, label, isActive, icon: Icon }) => (
              <Tooltip key={href}>
                <TooltipTrigger asChild>
                  <Link
                    href={href}
                    className={cn(
                      iconButtonClass,
                      isActive
                        ? "border-transparent bg-sidebar-accent/75 text-sidebar-accent-foreground shadow-none"
                        : "border-transparent text-sidebar-foreground/52 hover:-translate-y-[1px] hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
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
        </div>
        <div className="flex flex-col items-center gap-2 pb-4">
          {auth.phase === "authenticated" && auth.user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="pressable flex h-9 w-9 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground/78 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                  aria-label="User menu"
                >
                  <AvatarFace
                    name={avatarSeed}
                    size={36}
                    color={avatarColor ?? undefined}
                    className="h-full w-full"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" sideOffset={8} align="start">
                <ProfileMenuPanel />
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onOpenSettings}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="text-destructive focus:text-destructive"
                >
                  {isSigningOut ? (
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="mr-2 h-4 w-4" />
                  )}
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <AuthEntryPoint triggerVariant="rail-avatar" />
          )}
        </div>
      </aside>
      <div aria-hidden className="hidden w-14 shrink-0 md:block" />
    </>
  );
}
