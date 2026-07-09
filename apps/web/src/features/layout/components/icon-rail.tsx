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
import { usePathname, useRouter } from "next/navigation";
import { memo, useEffect, useRef, useState } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/ui/tooltip";
import { RawLogo } from "@/shared/icons/logo";
import { useAuth } from "@/core/auth/use-auth";
import { signOut } from "@/core/auth";
import { isAdmin } from "@/lib/roles";
import { UserMenu } from "./user-menu";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { AvatarSkeleton } from "./avatar-skeleton";
import { AuthDrawerHost, openAuthDrawer } from "./auth-drawer-host";
import { isTauriRuntime, useWorkspaceCapabilities } from "@/core/workspace-backend";
import { useShortcutHint } from "@/core/shortcuts";
import { goto, useGotoTarget, type GotoDestination } from "@/core/quick-access";
import { useSettingsModal } from "@/features/settings/use-settings-modal";
import type { AnimatedIconHandle } from "@/shared/icons/types";
import type { ReactNode, Ref } from "react";

const iconButtonClass =
	"relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors duration-200";

const inactiveNavClass =
	"border-transparent text-sidebar-foreground/52 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground";

function openAuthDrawerFor(destination: string) {
	openAuthDrawer("login", destination);
}

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

function IconRailImpl() {
	const pathname = usePathname();
	const router = useRouter();
	const auth = useAuth();
	const settingsShortcut = useShortcutHint("notes.settings");
	const settingsOpen = useSettingsModal((state) => state.isOpen);
	const openSettingsModal = useSettingsModal((state) => state.open);
	const capabilities = useWorkspaceCapabilities();
	const showAnimatedIcons = usePreferencesStore((state) => state.appearance.showAnimatedIcons);
	const [isMounted, setIsMounted] = useState(false);
	const settingsIconRef = useRef<AnimatedIconHandle>(null);

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

	const handleSignOut = async () => {
		await signOut();
		router.replace("/app?auth=sign-in");
	};

	const isAuthenticated = auth.isReady && auth.phase === "authenticated";

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
			{/* Drawer host is a sibling of <aside>, not its child — fixed
			    positioning breaks if an ancestor creates a containing block. */}
			<AuthDrawerHost />
		</>
	);
}

export const IconRail = memo(IconRailImpl);
