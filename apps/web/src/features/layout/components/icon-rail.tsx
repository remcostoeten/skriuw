"use client";
/* eslint-disable react-doctor/no-giant-component, react-doctor/rendering-hydration-no-flicker, react-doctor/no-initialize-state, react-doctor/url-prefilled-privileged-action, react-doctor/nextjs-no-client-side-redirect */

import {
	Activity,
	BookOpen,
	FolderOpen,
	Hash,
	Settings,
	Trash2,
	UserRound,
	Users,
	Waypoints,
} from "lucide-react";
import { ActivityIcon } from "@/shared/icons/activity-icon";
import { FolderOpenIcon } from "@/shared/icons/folder-open";
import { BookOpenIcon } from "@/shared/icons/book-open";
import { HashIcon } from "@/shared/icons/hash";
import { SettingsIcon } from "@/shared/icons/settings";
import { Trash2Icon } from "@/shared/icons/trash-2";
import { UsersIcon } from "@/shared/icons/users";
import { WaypointsIcon } from "@/shared/icons/waypoints";
import { usePreferencesStore } from "@/features/settings/store";
import { cn } from "@/shared/lib/utils";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { memo, useEffect, useMemo, useRef, useState } from "react";
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
import { resolveAuthError } from "@/app/(auth)/auth-errors";
import { AvatarSkeleton } from "./avatar-skeleton";
import {
	GUEST_SIGNUP_PROMPT_EVENT,
	isTauriRuntime,
	useWorkspaceCapabilities,
} from "@/core/workspace-backend";
import { useShortcutHint } from "@/core/shortcuts";
import { goto, useGotoTarget, type GotoDestination } from "@/core/quick-access";
import { showUserToast } from "@/shared/lib/user-toast";
import { useSettingsModal } from "@/features/settings/use-settings-modal";
import type { AnimatedIconHandle } from "@/shared/icons/types";
import type { ReactNode, Ref } from "react";

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
		success: {
			messages: {
				signIn: "Signed in",
				signUp: "Account created",
				oauth: "Signed in",
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

const iconButtonClass =
	"relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors duration-200";

const inactiveNavClass =
	"border-transparent text-sidebar-foreground/52 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground";

type RailNavItemProps = {
	href: string;
	label: string;
	requiresAuth?: boolean;
	isActive: boolean;
	icon: (active: boolean, ref?: Ref<AnimatedIconHandle>) => ReactNode;
	gotoKeybind: string;
	gotoDestination: GotoDestination;
	isAuthenticated: boolean;
	onRequireAuth: (href: string) => void;
	introDelay: number;
};

function RailNavItem({
	href,
	label,
	requiresAuth,
	isActive,
	icon,
	gotoKeybind,
	gotoDestination,
	isAuthenticated,
	onRequireAuth,
	introDelay,
}: RailNavItemProps) {
	const gotoRef = useGotoTarget({ keybind: gotoKeybind, to: gotoDestination });
	const iconRef = useRef<AnimatedIconHandle>(null);

	useEffect(() => {
		const startTimer = setTimeout(() => iconRef.current?.startAnimation(), introDelay);
		const stopTimer = setTimeout(() => iconRef.current?.stopAnimation(), introDelay + 900);
		return () => {
			clearTimeout(startTimer);
			clearTimeout(stopTimer);
		};
	}, [introDelay]);

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				{requiresAuth && !isAuthenticated ? (
					<button
						ref={gotoRef}
						type="button"
						onClick={() => onRequireAuth(href)}
						className={cn(iconButtonClass, inactiveNavClass)}
						aria-label={label}
					>
						{icon(false, iconRef)}
					</button>
				) : (
					<Link
						ref={gotoRef}
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
						{icon(isActive, iconRef)}
					</Link>
				)}
			</TooltipTrigger>
			<TooltipContent side="right">{label}</TooltipContent>
		</Tooltip>
	);
}

type NavItemProps = {
	item: Omit<RailNavItemProps, "isAuthenticated" | "onRequireAuth" | "introDelay">;
	isAuthenticated: boolean;
	onRequireAuth: (href: string) => void;
	introDelay: number;
};

function NavItem({ item, isAuthenticated, onRequireAuth, introDelay }: NavItemProps) {
	return (
		<RailNavItem
			{...item}
			isAuthenticated={isAuthenticated}
			onRequireAuth={onRequireAuth}
			introDelay={introDelay}
		/>
	);
}

function getPathWithoutAuthParams(pathname: string, searchParams: URLSearchParams): string {
	const nextParams = new URLSearchParams(searchParams.toString());
	nextParams.delete("auth");
	nextParams.delete("next");

	const query = nextParams.toString();
	return query ? `${pathname}?${query}` : pathname;
}

function IconRailImpl() {
	const pathname = usePathname();
	const router = useRouter();
	const searchParams = useSearchParams();
	const auth = useAuth();
	const settingsShortcut = useShortcutHint("notes.settings");
	const settingsOpen = useSettingsModal((state) => state.isOpen);
	const openSettingsModal = useSettingsModal((state) => state.open);
	const capabilities = useWorkspaceCapabilities();
	const showAnimatedIcons = usePreferencesStore((state) => state.appearance.showAnimatedIcons);
	const [isMounted, setIsMounted] = useState(false);
	const [authDrawerOpen, setAuthDrawerOpen] = useState(false);
	const [authDrawerInitialMode, setAuthDrawerInitialMode] =
		useState<AuthDrawerInitialMode>("login");
	const authDestinationRef = useRef<string | null>(null);
	const settingsIconRef = useRef<AnimatedIconHandle>(null);
	const [duplicateOAuth, setDuplicateOAuth] = useState<DuplicateOAuthEmailDetail | null>(null);
	// Desktop is a single local profile with no cloud auth, so nothing is
	// "protected" — gating these would only pop a sign-in drawer that can never
	// resolve and would block the user out of Settings/Journal.
	const protectedRoutes = useMemo(
		() => (isTauriRuntime() ? new Set<string>() : new Set(["/app/journal", "/app/shared"])),
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
		const introDelay = 720;
		const startTimer = setTimeout(() => settingsIconRef.current?.startAnimation(), introDelay);
		const stopTimer = setTimeout(
			() => settingsIconRef.current?.stopAnimation(),
			introDelay + 900,
		);
		return () => {
			clearTimeout(startTimer);
			clearTimeout(stopTimer);
		};
	}, []);

	useEffect(() => {
		const initialMode = resolveAuthDrawerMode(searchParams.get("auth"));
		if (!initialMode || !auth.isReady) return;

		// react-doctor-disable-next-line react-doctor/url-prefilled-privileged-action -- auth and redirect params are already normalized and bounded before use.
		const destination = resolveNextDestination(searchParams.get("next")) ?? "/app";
		const cleanPath = getPathWithoutAuthParams(pathname, searchParams);

		if (auth.phase === "authenticated") {
			router.replace(destination, { scroll: false });
			return;
		}

		setAuthDrawerInitialMode(initialMode);
		authDestinationRef.current = destination;
		setAuthDrawerOpen(true);
		router.replace(cleanPath, { scroll: false });
	}, [auth.isReady, auth.phase, pathname, router, searchParams]);

	// Intentionally excludes `authDrawerOpen`: this effect only gates entry
	// onto a protected route, it must not re-fire (and reopen the drawer)
	// just because the drawer's own open state changed, or a deliberate
	// dismissal would be immediately undone.
	useEffect(() => {
		if (!auth.isReady || auth.phase === "authenticated") return;
		if (!protectedRoutes.has(pathname)) return;

		authDestinationRef.current = pathname;
		setAuthDrawerOpen(true);
	}, [auth.isReady, auth.phase, pathname, protectedRoutes]);

	useEffect(() => {
		function handleGuestPrompt() {
			router.prefetch("/app");
			setAuthDrawerInitialMode("register");
			authDestinationRef.current = "/app";
			setAuthDrawerOpen(true);
		}
		window.addEventListener(GUEST_SIGNUP_PROMPT_EVENT, handleGuestPrompt);
		return () => window.removeEventListener(GUEST_SIGNUP_PROMPT_EVENT, handleGuestPrompt);
	}, [router]);

	useEffect(() => {
		function handleDuplicateOAuth(event: Event) {
			const detail = (event as CustomEvent<DuplicateOAuthEmailDetail>).detail;
			if (!detail) return;
			setDuplicateOAuth(detail);
		}
		window.addEventListener(DUPLICATE_OAUTH_EMAIL_EVENT, handleDuplicateOAuth);
		return () => window.removeEventListener(DUPLICATE_OAUTH_EMAIL_EVENT, handleDuplicateOAuth);
	}, []);

	const handleDuplicateOAuthSignIn = async (provider: string) => {
		setDuplicateOAuth(null);
		try {
			await signInWithOAuth(provider as OAuthProvider, {
				rememberMe: getRememberMePreference(),
			});
		} catch (error) {
			const notice = resolveAuthError(
				error instanceof Error ? error : new Error(String(error)),
			);
			showUserToast(`${notice.title}: ${notice.message}`, "error");
		}
	};

	const handleSignOut = async () => {
		await signOut();
		router.replace("/app?auth=sign-in");
	};

	const isAuthenticated = auth.isReady && auth.phase === "authenticated";
	const openAuthDrawerFor = (destination: string) => {
		router.prefetch(destination);
		setAuthDrawerInitialMode("login");
		authDestinationRef.current = destination;
		setAuthDrawerOpen(true);
	};

	const navItems = [
		{
			href: "/app",
			label: "Notes",
			gotoKeybind: "n",
			gotoDestination: goto.route.notes,
			isActive: pathname === "/app",
			icon: (active: boolean, ref?: Ref<AnimatedIconHandle>) =>
				showAnimatedIcons ? (
					<FolderOpenIcon
						ref={ref}
						size={18}
						className={
							active ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/52"
						}
					/>
				) : (
					<FolderOpen
						className={cn(
							"h-[18px] w-[18px]",
							active
								? "text-sidebar-accent-foreground"
								: "text-sidebar-foreground/52",
						)}
						strokeWidth={1.6}
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
			gotoKeybind: "j",
			gotoDestination: goto.route.journal,
			isActive: pathname === "/app/journal",
			icon: (_active: boolean, ref?: Ref<AnimatedIconHandle>) =>
				showAnimatedIcons ? (
					<BookOpenIcon ref={ref} size={18} />
				) : (
					<BookOpen className="h-[18px] w-[18px]" strokeWidth={1.6} />
				),
		},
		{
			href: "/app/graph",
			label: "Graph",
			gotoKeybind: "g",
			gotoDestination: goto.route.graph,
			isActive: pathname === "/app/graph",
			icon: (_active: boolean, ref?: Ref<AnimatedIconHandle>) =>
				showAnimatedIcons ? (
					<WaypointsIcon ref={ref} size={18} />
				) : (
					<Waypoints className="h-[18px] w-[18px]" strokeWidth={1.6} />
				),
		},
		{
			href: "/app/tags",
			label: "Tags",
			gotoKeybind: "t",
			gotoDestination: goto.route.tags,
			isActive: pathname.startsWith("/app/tags"),
			icon: (_active: boolean, ref?: Ref<AnimatedIconHandle>) =>
				showAnimatedIcons ? (
					<HashIcon ref={ref} size={18} />
				) : (
					<Hash className="h-[18px] w-[18px]" strokeWidth={1.6} />
				),
		},
		{
			href: "/app/people",
			label: "People",
			gotoKeybind: "p",
			gotoDestination: goto.route.people,
			isActive: pathname.startsWith("/app/people"),
			icon: (_active: boolean, ref?: Ref<AnimatedIconHandle>) =>
				showAnimatedIcons ? (
					<UsersIcon ref={ref} size={18} />
				) : (
					<Users className="h-[18px] w-[18px]" strokeWidth={1.6} />
				),
		},
		{
			href: "/app/activity",
			label: "Activity",
			gotoKeybind: "a",
			gotoDestination: goto.route.activity,
			isActive: pathname.startsWith("/app/activity"),
			icon: (_active: boolean, ref?: Ref<AnimatedIconHandle>) =>
				showAnimatedIcons ? (
					<ActivityIcon ref={ref} size={18} />
				) : (
					<Activity className="h-[18px] w-[18px]" strokeWidth={1.6} />
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
		gotoKeybind: "x",
		gotoDestination: goto.route.trash,
		isActive: pathname === "/app/trash",
		icon: (_active: boolean, ref?: Ref<AnimatedIconHandle>) =>
			showAnimatedIcons ? (
				<Trash2Icon ref={ref} size={18} />
			) : (
				<Trash2 className="h-[18px] w-[18px]" strokeWidth={1.6} />
			),
	};

	return (
		<>
			{/* The aside must NOT be inside AuthProvider — fixed positioning breaks
			    if any ancestor creates a new containing block (transform, filter, etc.) */}
			<aside
				data-tauri-drag-region
				className="fixed inset-y-0 left-0 z-30 hidden w-14 flex-col
      items-center justify-between border-r border-sidebar-border bg-sidebar md:flex"
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
						{navItems.map((item, index) => (
							<NavItem
								key={item.href}
								item={item}
								isAuthenticated={isAuthenticated}
								onRequireAuth={openAuthDrawerFor}
								introDelay={index * 90}
							/>
						))}
					</div>
				</div>
				<div className="flex w-full flex-col items-center gap-3 pb-4">
					<NavItem
						item={trashNavItem}
						isAuthenticated={isAuthenticated}
						onRequireAuth={openAuthDrawerFor}
						introDelay={navItems.length * 90}
					/>
					<div className="h-px w-8 bg-sidebar-border" aria-hidden="true" />
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={() => openSettingsModal()}
								className={cn(
									iconButtonClass,
									settingsOpen
										? "border-transparent bg-sidebar-accent/75 text-sidebar-accent-foreground shadow-none"
										: inactiveNavClass,
								)}
								aria-label="Settings"
								aria-haspopup="dialog"
								aria-expanded={settingsOpen}
							>
								{showAnimatedIcons ? (
									<SettingsIcon ref={settingsIconRef} size={18} />
								) : (
									<Settings className="h-[18px] w-[18px]" strokeWidth={1.6} />
								)}
							</button>
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
							onSettings={() => openSettingsModal()}
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
					// Not a plain toast: it needs an action, which the shared
					// user-toast-host can't render. z-[110] keeps it above the
					// toast host (z-[100]) instead of overlapping it.
					<div className="fixed bottom-4 left-16 z-[110] w-[min(24rem,calc(100vw-5rem))]">
						<div
							role="alert"
							className="border border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur"
						>
							<p className="text-sm font-medium text-foreground">
								Account already exists
							</p>
							<p className="mt-1 text-sm text-muted-foreground">
								An account with this email already exists via{" "}
								{getProviderLabel(duplicateOAuth.provider)}. Would you like to sign
								in with {getProviderLabel(duplicateOAuth.provider)} instead?
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
				) : null}
				<AuthDrawer
					adapter={authDrawerAdapter}
					hideTrigger
					open={authDrawerOpen}
					onOpenChange={(open) => {
						setAuthDrawerOpen(open);
						if (!open) {
							authDestinationRef.current = null;
						}
					}}
					onSuccess={() => {
						setDuplicateOAuth(null);
						const destination = authDestinationRef.current;
						if (destination && destination !== pathname) {
							router.push(destination);
						}
						authDestinationRef.current = null;
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

						const notice = resolveAuthError(new Error(fallbackMessage));
						showUserToast(`${notice.title}: ${notice.message}`, "error");
					}}
					config={activeAuthDrawerConfig}
				/>
			</AuthProvider>
		</>
	);
}

export const IconRail = memo(IconRailImpl);
