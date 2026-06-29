"use client";

import { BookOpen, Settings, Trash2, UserRound, Waypoints } from "lucide-react";
import { FolderOpenIcon } from "@/shared/icons/folder-open";
import { cn } from "@/shared/lib/utils";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/ui/tooltip";
import { RawLogo } from "@/shared/icons/logo";
import { useAuth } from "@/core/auth/use-auth";
import { signOut, signInWithOAuth, getRememberMePreference } from "@/core/auth";
import {
	DUPLICATE_OAUTH_EMAIL_EVENT,
	getProviderLabel,
	type DuplicateOAuthEmailDetail,
} from "@/core/auth/connections";
import type { OAuthProvider } from "@/core/auth";
import { isAdmin } from "@/lib/roles";
import { AuthDrawer, AuthProvider } from "@remcostoeten/auth-drawer";
import type { AuthConfig } from "@remcostoeten/auth-drawer";
import { authDrawerAdapter } from "@/features/auth/auth-drawer-adapter";
import { UserMenu } from "./user-menu";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { resolveAuthError, type AuthErrorNotice } from "@/app/(auth)/auth-errors";
import { AvatarSkeleton } from "./avatar-skeleton";
import {
	GUEST_SIGNUP_PROMPT_EVENT,
	isTauriRuntime,
	useWorkspaceCapabilities,
} from "@/core/workspace-backend";
import { useShortcutHint } from "@/core/shortcuts";

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

type AuthDrawerInitialMode = "login" | "register";

function resolveAuthDrawerMode(value: string | null): AuthDrawerInitialMode | null {
	if (value === "sign-in") return "login";
	if (value === "sign-up") return "register";
	return null;
}

function resolveNextDestination(value: string | null): string | null {
	if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
	return value;
}

function getPathWithoutAuthParams(pathname: string, searchParams: URLSearchParams): string {
	const nextParams = new URLSearchParams(searchParams.toString());
	nextParams.delete("auth");
	nextParams.delete("next");

	const query = nextParams.toString();
	return query ? `${pathname}?${query}` : pathname;
}

export function IconRail({ onOpenSettings }: Props) {
	const pathname = usePathname();
	const router = useRouter();
	const searchParams = useSearchParams();
	const auth = useAuth();
	const settingsShortcut = useShortcutHint("notes.settings");
	const capabilities = useWorkspaceCapabilities();
	const [isMounted, setIsMounted] = useState(false);
	const [authDrawerOpen, setAuthDrawerOpen] = useState(false);
	const [authDrawerInitialMode, setAuthDrawerInitialMode] =
		useState<AuthDrawerInitialMode>("login");
	const [authDestination, setAuthDestination] = useState<string | null>(null);
	const [authDrawerError, setAuthDrawerError] = useState<AuthErrorNotice | null>(null);
	const [duplicateOAuth, setDuplicateOAuth] = useState<DuplicateOAuthEmailDetail | null>(null);
	// Desktop is a single local profile with no cloud auth, so nothing is
	// "protected" — gating these would only pop a sign-in drawer that can never
	// resolve and would block the user out of Settings/Journal.
	const protectedRoutes = useMemo(
		() =>
			isTauriRuntime()
				? new Set<string>()
				: new Set(["/app/journal", "/app/settings", "/app/shared"]),
		[],
	);
	const activeAuthDrawerConfig = useMemo(
		() =>
			({
				...authDrawerConfig,
				ui: {
					...authDrawerConfig.ui,
					auth: {
						initialMode: authDrawerInitialMode,
					},
				},
			}) satisfies AuthConfig,
		[authDrawerInitialMode],
	);

	useEffect(() => {
		setIsMounted(true);
	}, []);

	useEffect(() => {
		const initialMode = resolveAuthDrawerMode(searchParams.get("auth"));
		if (!initialMode || !auth.isReady) return;

		const destination = resolveNextDestination(searchParams.get("next")) ?? "/app";
		const cleanPath = getPathWithoutAuthParams(pathname, searchParams);

		if (auth.phase === "authenticated") {
			router.replace(destination, { scroll: false });
			return;
		}

		setAuthDrawerInitialMode(initialMode);
		setAuthDestination(destination);
		setAuthDrawerError(null);
		setAuthDrawerOpen(true);
		router.replace(cleanPath, { scroll: false });
	}, [auth.isReady, auth.phase, pathname, router, searchParams]);

	useEffect(() => {
		if (!auth.isReady || auth.phase === "authenticated") return;
		if (!protectedRoutes.has(pathname)) return;
		if (authDrawerOpen) return;

		setAuthDestination(pathname);
		setAuthDrawerError(null);
		setAuthDrawerOpen(true);
	}, [auth.isReady, auth.phase, authDrawerOpen, pathname, protectedRoutes]);

	useEffect(() => {
		function handleGuestPrompt() {
			router.prefetch("/app");
			setAuthDrawerInitialMode("register");
			setAuthDestination("/app");
			setAuthDrawerError(null);
			setAuthDrawerOpen(true);
		}
		window.addEventListener(GUEST_SIGNUP_PROMPT_EVENT, handleGuestPrompt);
		return () => window.removeEventListener(GUEST_SIGNUP_PROMPT_EVENT, handleGuestPrompt);
	}, [router]);

	useEffect(() => {
		function handleDuplicateOAuth(event: Event) {
			const detail = (event as CustomEvent<DuplicateOAuthEmailDetail>).detail;
			if (!detail) return;
			setAuthDrawerError(null);
			setDuplicateOAuth(detail);
		}
		window.addEventListener(DUPLICATE_OAUTH_EMAIL_EVENT, handleDuplicateOAuth);
		return () =>
			window.removeEventListener(DUPLICATE_OAUTH_EMAIL_EVENT, handleDuplicateOAuth);
	}, []);

	const handleDuplicateOAuthSignIn = async (provider: string) => {
		try {
			await signInWithOAuth(provider as OAuthProvider, {
				rememberMe: getRememberMePreference(),
			});
		} catch {
			setDuplicateOAuth(null);
		}
	};

	const handleSignOut = async () => {
		await signOut();
		window.location.replace("/app?auth=sign-in");
	};

	const isAuthenticated = auth.isReady && auth.phase === "authenticated";
	const openAuthDrawerFor = (destination: string) => {
		router.prefetch(destination);
		setAuthDrawerInitialMode("login");
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
			// Gate on the backend capability, not auth state: the desktop backend
			// serves journal locally (no cloud auth), so it advertises journal=true
			// and the link is reachable directly. On web only the signed-in server
			// backend enables it; guests get the sign-in drawer.
			requiresAuth: !capabilities.journal,
			label: "Journal",
			isActive: pathname === "/app/journal",
			icon: (_active: boolean) => (
				<BookOpen className="h-[18px] w-[18px]" strokeWidth={1.6} />
			),
		},
		{
			href: "/app/graph",
			label: "Graph",
			isActive: pathname === "/app/graph",
			icon: (_active: boolean) => (
				<Waypoints className="h-[18px] w-[18px]" strokeWidth={1.6} />
			),
		},
	];
	const trashNavItem = {
		href: "/app/trash",
		// Same capability gate as Journal: the desktop backend serves a local
		// trash (no cloud auth), so it advertises trash=true and the link is
		// reachable; on web only the signed-in server backend enables it.
		requiresAuth: !capabilities.trash,
		label: "Trash",
		isActive: pathname === "/app/trash",
		icon: (_active: boolean) => (
			<Trash2 className="h-[18px] w-[18px]" strokeWidth={1.6} />
		),
	};

	const iconButtonClass =
		"relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors duration-200";

	const inactiveNavClass =
		"border-transparent text-sidebar-foreground/52 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground";

	const renderNavItem = ({
		href,
		label,
		requiresAuth,
		isActive,
		icon,
	}: (typeof navItems)[number] | typeof trashNavItem) => (
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
						prefetch
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
	);

	return (
		<>
			{/* The aside must NOT be inside AuthProvider — fixed positioning breaks
			    if any ancestor creates a new containing block (transform, filter, etc.) */}
			<aside
				data-tauri-drag-region
				className="fixed inset-y-0 left-0 z-30 hidden w-14 flex-col
      items-center justify-between border-r border-sidebar-border bg-sidebar/95
      backdrop-blur supports-[backdrop-filter]:bg-sidebar/85 md:flex"
			>
				<div className="flex w-full flex-col items-center">
					<div
						data-tauri-drag-region
						className="flex h-11
      w-full items-center justify-center border-b border-sidebar-border"
					>
						<Tooltip>
							<TooltipTrigger asChild>
								<Link
									href="/app"
									className="rounded-2xl border border-transparent p-1.5 text-sidebar-foreground/92 transition-colors hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
									aria-label="Go to home"
								>
									<RawLogo variant="sidebar" size={26} />
								</Link>
							</TooltipTrigger>
							<TooltipContent side="right">Skriuw</TooltipContent>
						</Tooltip>
					</div>
					<div className="mt-4 flex w-full flex-col items-center gap-4">
						{navItems.map(renderNavItem)}
					</div>
				</div>
				<div className="flex w-full flex-col items-center gap-3 pb-4">
					{renderNavItem(trashNavItem)}
					<div className="h-px w-8 bg-sidebar-border" aria-hidden="true" />
					<Tooltip>
						<TooltipTrigger asChild>
							<Link
								href="/app/settings"
								prefetch
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
						<TooltipContent side="right" shortcut={settingsShortcut}>
							Settings
						</TooltipContent>
					</Tooltip>
					{isMounted && auth.phase === "authenticated" && auth.user && (
						<NotificationBell variant="rail" />
					)}
					{isTauriRuntime() ? null : !isMounted || !auth.isReady ? (
						<AvatarSkeleton />
					) : auth.phase === "authenticated" && auth.user ? (
						<UserMenu
							onSettings={onOpenSettings}
							onSignOut={handleSignOut}
							onProfile={() => router.push("/app/profile")}
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
									className="group flex h-9 w-9 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground/78 transition-colors hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
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
				{duplicateOAuth ? (
					<div className="fixed bottom-4 left-16 z-[60] w-[min(24rem,calc(100vw-5rem))]">
						<div
							role="alert"
							className="border border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur"
						>
							<p className="text-sm font-medium text-foreground">
								Account already exists
							</p>
							<p className="mt-1 text-sm text-muted-foreground">
								An account with this email already exists via{" "}
								{getProviderLabel(duplicateOAuth.provider)}. Would you like to sign in
								with {getProviderLabel(duplicateOAuth.provider)} instead?
							</p>
							<div className="mt-3 flex items-center gap-2">
								<button
									type="button"
									onClick={() =>
										handleDuplicateOAuthSignIn(duplicateOAuth.provider)
									}
									className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
								>
									Sign in with {getProviderLabel(duplicateOAuth.provider)}
								</button>
								<button
									type="button"
									onClick={() => setDuplicateOAuth(null)}
									className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
								>
									Dismiss
								</button>
							</div>
						</div>
					</div>
				) : authDrawerError ? (
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
						if (!open) {
							setAuthDestination(null);
						}
					}}
					onSuccess={() => {
						setAuthDrawerError(null);
						setDuplicateOAuth(null);
						if (authDestination && authDestination !== pathname) {
							router.push(authDestination);
						}
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

						// The duplicate-OAuth-email case is surfaced as a richer prompt
						// via DUPLICATE_OAUTH_EMAIL_EVENT, so skip the plain error notice.
						if (fallbackMessage.includes("already exists via")) return;

						setAuthDrawerError(resolveAuthError(new Error(fallbackMessage)));
					}}
					config={activeAuthDrawerConfig}
				/>
			</AuthProvider>
		</>
	);
}
