"use client";

import { BookOpen, Kanban, Settings, UserRound, Waypoints } from "lucide-react";
import { FolderOpenIcon } from "@/shared/icons/folder-open";
import { cn } from "@/shared/lib/utils";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/ui/tooltip";
import { RawLogo } from "@/shared/icons/logo";
import { useAuth } from "@/core/auth/use-auth";
import { signOut } from "@/core/auth";
import { isAdmin } from "@/lib/roles";
import { AuthDrawer, AuthProvider } from "@remcostoeten/auth-drawer";
import type { AuthConfig } from "@remcostoeten/auth-drawer";
import { authDrawerAdapter } from "@/features/auth/auth-drawer-adapter";
import { UserMenu } from "./user-menu";
import { resolveAuthError, type AuthErrorNotice } from "@/app/(auth)/auth-errors";

type Props = {
	onOpenSettings: () => void;
};

const authDrawerConfig = {
	ui: {
		presentation: { variant: "drawer" },
		visual: {
			// Keep the overlay dark enough to read while still letting a trace of
			// the app background show through the blur.
			backdrop: {
				opacity: 0.94,
				blur: 3,
				gradient: {
					angle: 180,
					from: "hsl(var(--scrim) / 0.12)",
					to: "hsl(var(--scrim) / 0.3)",
					fromPos: 0,
					toPos: 100,
				},
			},
		},
	},
} satisfies AuthConfig;

export function IconRail({ onOpenSettings }: Props) {
	const pathname = usePathname();
	const router = useRouter();
	const auth = useAuth();
	const [isMounted, setIsMounted] = useState(false);
	const [authDrawerOpen, setAuthDrawerOpen] = useState(false);
	const [authDestination, setAuthDestination] = useState<string | null>(null);
	const [authDrawerError, setAuthDrawerError] = useState<AuthErrorNotice | null>(null);

	useEffect(() => {
		setIsMounted(true);
	}, []);

	const handleSignOut = async () => {
		await signOut();
		window.location.replace("/sign-in");
	};

	const isAuthenticated = auth.isReady && auth.phase === "authenticated";
	const openAuthDrawerFor = (destination: string) => {
		setAuthDestination(destination);
		setAuthDrawerError(null);
		setAuthDrawerOpen(true);
	};

	const navItems = [
		{
			href: "/app",
			label: "Notes",
			isActive: pathname === "/app",
			icon: (active: boolean) => (
				<FolderOpenIcon
					size={18}
					className={
						active ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/52"
					}
				/>
			),
		},
		{
			href: "/app/journal",
			label: "Journal",
			requiresAuth: true,
			isActive: pathname === "/app/journal",
			icon: (_active: boolean) => (
				<BookOpen className="h-[18px] w-[18px]" strokeWidth={1.6} />
			),
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

	const isGraphActive = pathname === "/app/graph";
	const inactiveNavClass =
		"border-transparent text-sidebar-foreground/52 hover:-translate-y-[1px] hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground";

	return (
		<>
			{/* The aside must NOT be inside AuthProvider — fixed positioning breaks
			    if any ancestor creates a new containing block (transform, filter, etc.) */}
			<aside
				className="fixed inset-y-0 left-0 z-30 hidden w-14 flex-col
      items-center justify-between border-r border-sidebar-border bg-sidebar/95
      backdrop-blur supports-[backdrop-filter]:bg-sidebar/85 md:flex"
			>
				<div className="flex w-full flex-col items-center">
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
						{navItems.map(({ href, label, requiresAuth, isActive, icon }) => (
							<Tooltip key={href}>
								<TooltipTrigger asChild>
									{requiresAuth && !isAuthenticated ? (
										<button
											type="button"
											onClick={() => openAuthDrawerFor(href)}
											className={cn(iconButtonClass, inactiveNavClass)}
											aria-label={label}
										>
											{icon(false)}
										</button>
									) : (
										<Link
											href={href}
											className={cn(
												iconButtonClass,
												isActive
													? "border-transparent bg-sidebar-accent/75 text-sidebar-accent-foreground shadow-none"
													: inactiveNavClass,
											)}
											aria-label={label}
											aria-current={isActive ? "page" : undefined}
										>
											{icon(isActive)}
										</Link>
									)}
								</TooltipTrigger>
								<TooltipContent side="right">{label}</TooltipContent>
							</Tooltip>
						))}

						{/* Graph — navigates when authenticated, opens auth drawer otherwise */}
						<Tooltip>
							<TooltipTrigger asChild>
								{isAuthenticated ? (
									<Link
										href="/app/graph"
										className={cn(
											iconButtonClass,
											isGraphActive
												? "border-transparent bg-sidebar-accent/75 text-sidebar-accent-foreground shadow-none"
												: inactiveNavClass,
										)}
										aria-label="Graph"
										aria-current={isGraphActive ? "page" : undefined}
									>
										<Waypoints
											className="h-[18px] w-[18px]"
											strokeWidth={1.6}
										/>
									</Link>
								) : (
									<button
										type="button"
										onClick={() => openAuthDrawerFor("/app/graph")}
										className={cn(iconButtonClass, inactiveNavClass)}
										aria-label="Graph"
									>
										<Waypoints
											className="h-[18px] w-[18px]"
											strokeWidth={1.6}
										/>
									</button>
								)}
							</TooltipTrigger>
							<TooltipContent side="right">Graph</TooltipContent>
						</Tooltip>
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
										: inactiveNavClass,
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
					<Tooltip>
						<TooltipTrigger asChild>
							<Link
								href="/app/settings"
								className={cn(
									iconButtonClass,
									pathname === "/app/settings"
										? "border-transparent bg-sidebar-accent/75 text-sidebar-accent-foreground shadow-none"
										: inactiveNavClass,
								)}
								aria-label="Settings"
								aria-current={pathname === "/app/settings" ? "page" : undefined}
							>
								<Settings className="h-[18px] w-[18px]" strokeWidth={1.6} />
							</Link>
						</TooltipTrigger>
						<TooltipContent side="right">Settings</TooltipContent>
					</Tooltip>
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
							isAdmin={isAdmin(auth.user?.role)}
							onAdmin={() => router.push("/admin")}
						/>
					) : (
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => openAuthDrawerFor("/app")}
									aria-label="Sign in"
									className="pressable group flex h-9 w-9 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground/78 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
								>
									<UserRound className="h-4 w-4" strokeWidth={1.7} />
								</button>
							</TooltipTrigger>
							<TooltipContent side="right">Sign in</TooltipContent>
						</Tooltip>
					)}
				</div>
			</aside>
			<div aria-hidden className="hidden w-14 shrink-0 md:block" />
			{/* AuthProvider is a sibling of <aside>, not its parent.
			    AuthDrawer renders into a portal so it works fine here. */}
			<AuthProvider adapter={authDrawerAdapter}>
				{authDrawerError ? (
					<div className="fixed bottom-4 left-16 z-[60] w-[min(24rem,calc(100vw-5rem))]">
						<div
							role="alert"
							className="border border-destructive/25 bg-background/95 px-4 py-3 shadow-lg backdrop-blur"
						>
							<p className="text-sm font-medium text-foreground">
								{authDrawerError.title}
							</p>
							<p className="mt-1 text-sm text-muted-foreground">
								{authDrawerError.message}
							</p>
						</div>
					</div>
				) : null}
				<AuthDrawer
					adapter={authDrawerAdapter}
					hideTrigger
					open={authDrawerOpen}
					onOpenChange={(open) => {
						setAuthDrawerOpen(open);
						if (!open) setAuthDestination(null);
					}}
					onSuccess={() => {
						setAuthDrawerOpen(false);
						setAuthDrawerError(null);
						router.push(authDestination ?? "/app");
						setAuthDestination(null);
					}}
					onError={(error) => {
						const fallbackMessage =
							error instanceof Error
								? error.message
								: typeof error === "object" && error && "message" in error
									? String((error as { message?: unknown }).message ?? "")
									: typeof error === "string"
										? error
										: "Authentication failed";

						setAuthDrawerError(
							resolveAuthError(new Error(fallbackMessage)),
						);
					}}
					config={authDrawerConfig}
				/>
			</AuthProvider>
		</>
	);
}
