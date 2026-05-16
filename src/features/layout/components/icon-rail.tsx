"use client";

import { BookOpen, Kanban, UserRound } from "lucide-react";
import { FolderOpenIcon } from "@/shared/icons/folder-open";
import { cn } from "@/shared/lib/utils";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/ui/tooltip";
import { RawLogo } from "@/shared/icons/logo";
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import { signOut } from "@/platform/auth";
import { UserMenu } from "./user-menu";

interface IconRailProps {
    onOpenSettings: () => void;
}

export function IconRail({ onOpenSettings }: IconRailProps) {
    const pathname = usePathname();
    const router = useRouter();
    const auth = useAuthSnapshot();
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const handleSignOut = async () => {
        await signOut();
    };

    const navItems = [
        {
            href: "/app",
            label: "Notes",
            isActive: pathname === "/app",
            icon: (active: boolean) => (
                <FolderOpenIcon
                    size={18}
                    className={active ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/52"}
                />
            ),
        },
        {
            href: "/app/journal",
            label: "Journal",
            isActive: pathname === "/app/journal",
            icon: () => <BookOpen className="h-[18px] w-[18px]" strokeWidth={1.6} />,
        },
    ];
    const planningItem = {
        href: "/project-planning",
        label: "Planning",
        isActive: pathname === "/project-planning",
        icon: () => <Kanban className="h-[18px] w-[18px]" strokeWidth={1.6} />,
    };

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
                                <Link
                                    href="/app"
                                    className="rounded-2xl border border-transparent p-1.5 text-sidebar-foreground/92 transition-all hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                                    aria-label="Go to home"
                                >
                                    <RawLogo variant="sidebar" size={26} />
                                </Link>
                            </TooltipTrigger>
                            <TooltipContent side="right">Skriuw</TooltipContent>
                        </Tooltip>
                    </div>
                    <div className="mt-4 flex w-full flex-col items-center gap-4">
                        {navItems.map(({ href, label, isActive, icon }) => (
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
                                        {icon(isActive)}
                                    </Link>
                                </TooltipTrigger>
                                <TooltipContent side="right">{label}</TooltipContent>
                            </Tooltip>
                        ))}
                    </div>
                </div>
                <div className="flex w-full flex-col items-center gap-3 pb-4">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Link
                                href={planningItem.href}
                                className={cn(
                                    iconButtonClass,
                                    planningItem.isActive
                                        ? "border-transparent bg-sidebar-accent/75 text-sidebar-accent-foreground shadow-none"
                                        : "border-transparent text-sidebar-foreground/52 hover:-translate-y-[1px] hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                                )}
                                aria-label={planningItem.label}
                                aria-current={planningItem.isActive ? "page" : undefined}
                            >
                                {planningItem.icon()}
                            </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right">{planningItem.label}</TooltipContent>
                    </Tooltip>
                    <div className="h-px w-8 bg-sidebar-border" aria-hidden="true" />
                    {!isMounted ? (
                        <div
                            aria-hidden="true"
                            className="h-9 w-9 rounded-full border border-sidebar-border bg-sidebar"
                        />
                    ) : auth.phase === "authenticated" && auth.user ? (
                        <UserMenu
                            onSettings={onOpenSettings}
                            onSignOut={handleSignOut}
                            onNotes={() => router.push("/app")}
                            onJournal={() => router.push("/app/journal")}
                            onActivity={() => router.push("/app/activity")}
                        />
                    ) : (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Link
                                    href="/sign-in"
                                    aria-label="Sign in"
                                    className="pressable group flex h-9 w-9 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground/78 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                                >
                                    <UserRound className="h-4 w-4" strokeWidth={1.7} />
                                </Link>
                            </TooltipTrigger>
                            <TooltipContent side="right">Sign in</TooltipContent>
                        </Tooltip>
                    )}
                </div>
            </aside>
            <div aria-hidden className="hidden w-14 shrink-0 md:block" />
        </>
    );
}
