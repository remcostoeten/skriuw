"use client";

import * as React from "react";
import {
	FileText,
	BookOpen,
	Activity,
	Settings,
	LogOut,
	LoaderCircle,
	Shield,
	Bell,
	ChevronLeft,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import {
	NotificationPanel,
	useUnreadNotificationCount,
} from "@/features/notifications/components/notification-bell";
import { deriveAvatarColor, getAvatarSeed } from "@/shared/lib/avatar";
import { AvatarFace } from "@/shared/icons/avatar-face";
import { usePreferencesStore } from "@/features/settings/store";
import { useAuth } from "@/core/auth/use-auth";
import { useShortcutScope } from "@/core/shortcuts";
import { cn } from "@/shared/lib/utils";
import { useIsMobile } from "@/shared/hooks/use-mobile";

type TMenuItem = {
	key: string;
	label: string;
	icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
	shortcut: string;
	badge?: number;
	keepOpen?: boolean;
	onSelect?: () => void;
};

export type UserMenuProps = {
	onSettings: () => void;
	onSignOut: () => void;
	onProfile?: () => void;
	onNotes?: () => void;
	onJournal?: () => void;
	onActivity?: () => void;
	onAdmin?: () => void;
	isAdmin?: boolean;
};

function Shortcut({ value }: { value: string }) {
	const isMobile = useIsMobile();
	if (isMobile) return null;

	const tokens =
		value.trim().includes("+") || value.trim().includes(" ")
			? value
					.trim()
					.split(/[\s+]+/)
					.filter(Boolean)
			: Array.from(value.trim());

	return (
		<span className="ml-auto inline-flex items-center gap-1" aria-hidden>
			{tokens.map((t, i) => (
				<kbd
					key={`${t}-${i}`}
					className="inline-flex h-[18px] min-w-[18px] items-center justify-center border border-border bg-muted px-1 font-mono text-[10px] font-medium leading-none text-muted-foreground shadow-[inset_0_-1px_0_0_hsl(var(--scrim)/0.4)]"
				>
					{t}
				</kbd>
			))}
		</span>
	);
}

export function UserMenu({
	onSettings,
	onSignOut,
	onProfile,
	onNotes,
	onJournal,
	onActivity,
	onAdmin,
	isAdmin,
}: UserMenuProps) {
	const [open, setOpen] = React.useState(false);
	const [view, setView] = React.useState<"menu" | "notifications">("menu");
	const [isSigningOut, setIsSigningOut] = React.useState(false);
	const firstItemRef = React.useRef<HTMLButtonElement | null>(null);
	const user = useAuth().user;
	const unreadCount = useUnreadNotificationCount();
	const avatarColorPreference = usePreferencesStore((state) => state.profile.avatarColor);
	const avatarColor =
		user?.avatarColor ??
		avatarColorPreference ??
		(user ? deriveAvatarColor(user.id) : undefined);

	const handleSignOut = async () => {
		setOpen(false);
		setIsSigningOut(true);
		try {
			await onSignOut();
		} finally {
			setIsSigningOut(false);
		}
	};

	const handleAction = async (action?: () => void | Promise<void>) => {
		setOpen(false);
		await action?.();
	};

	// The single-letter nav shortcuts only arm while the menu is open, which is
	// what keeps "n"/"j"/"a"/"p" from hijacking ordinary typing.
	useShortcutScope(
		"user-menu",
		{
			"menu.profile": () => void handleAction(onProfile),
			"menu.notes": () => void handleAction(onNotes),
			"menu.journal": () => void handleAction(onJournal),
			"menu.activity": () => void handleAction(onActivity),
			"menu.signOut": () => void handleSignOut(),
		},
		{ active: open },
	);

	const menuItems: TMenuItem[] = [
		{
			key: "notifications",
			label: "Notifications",
			icon: Bell,
			shortcut: "",
			badge: unreadCount,
			onSelect: () => setView("notifications"),
			keepOpen: true,
		},
		{
			key: "notes",
			label: "Notes",
			icon: FileText,
			shortcut: "N",
			onSelect: onNotes,
		},
		{
			key: "journal",
			label: "Journal",
			icon: BookOpen,
			shortcut: "J",
			onSelect: onJournal,
		},
		{
			key: "activity",
			label: "Activity",
			icon: Activity,
			shortcut: "A",
			onSelect: onActivity,
		},
		{
			key: "settings",
			label: "Settings",
			icon: Settings,
			shortcut: "⌘,",
			onSelect: onSettings,
		},
		...(isAdmin
			? [
					{
						key: "admin",
						label: "Admin",
						icon: Shield,
						shortcut: "",
						onSelect: onAdmin,
					},
				]
			: []),
	];

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		if (!next) setView("menu");
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="pressable relative flex h-9 w-9 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground/78 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
					aria-label={`User menu${unreadCount > 0 ? `, ${unreadCount} unread notifications` : ""}`}
					aria-expanded={open}
				>
					<AvatarFace
						name={getAvatarSeed("", "account-user")}
						size={36}
						color={avatarColor ?? undefined}
						className="h-full w-full"
					/>
					{unreadCount > 0 && (
						<span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-sidebar bg-destructive px-1 text-[9px] font-semibold leading-none text-destructive-foreground tabular-nums">
							{unreadCount > 9 ? "9+" : unreadCount}
						</span>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="right"
				sideOffset={8}
				className={cn(
					"rounded-none border border-border bg-popover text-popover-foreground shadow-[0_20px_50px_-10px_hsl(var(--scrim)/0.7)]",
					view === "notifications" ? "w-80 p-0" : "w-60 p-1",
				)}
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					firstItemRef.current?.focus();
				}}
			>
				{view === "notifications" ? (
					<>
						<button
							type="button"
							onClick={() => setView("menu")}
							className="flex w-full items-center gap-1.5 border-b border-border px-2 py-2 text-left text-[12px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus:text-foreground"
						>
							<ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
							Back
						</button>
						<NotificationPanel onNavigate={() => handleOpenChange(false)} />
					</>
				) : (
					<>
						{user ? (
							<>
								<div className="flex items-center gap-2.5 px-2 py-2">
									<AvatarFace
										name={getAvatarSeed("", "account-user")}
										size={32}
										color={avatarColor ?? undefined}
										className="h-8 w-8 shrink-0"
									/>
									<div className="min-w-0 flex-1">
										{user.name ? (
											<div className="truncate text-[13px] font-semibold text-popover-foreground">
												{user.name}
											</div>
										) : null}
										<div className="truncate text-[11px] text-muted-foreground">
											{user.email}
										</div>
									</div>
								</div>
								<div className="my-0 -mx-1 h-px bg-border" aria-hidden="true" />
							</>
						) : null}

						<div role="group" className="py-1" aria-label="User menu actions">
							{menuItems.map((item, index) => {
								const Icon = item.icon;
								return (
									<button
										key={item.key}
										ref={index === 0 ? firstItemRef : undefined}
										type="button"
										onClick={() =>
											item.keepOpen
												? item.onSelect?.()
												: void handleAction(item.onSelect)
										}
										className={cn(
											"group/item flex w-full cursor-default items-center rounded-none px-2 py-1.5 text-left text-[13px] font-medium outline-none",
											"text-popover-foreground/80 focus:bg-accent focus:text-popover-foreground",
										)}
									>
										{Icon ? (
											<Icon
												className="mr-2 h-[15px] w-[15px] text-muted-foreground group-focus/item:text-current"
												strokeWidth={1.75}
											/>
										) : null}
										<span className="truncate">{item.label}</span>
										{item.badge ? (
											<span className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground tabular-nums">
												{item.badge > 9 ? "9+" : item.badge}
											</span>
										) : item.shortcut ? (
											<Shortcut value={item.shortcut} />
										) : null}
									</button>
								);
							})}
						</div>

						<div className="my-0 -mx-1 h-px bg-border" aria-hidden="true" />
						<div className="py-1">
							<button
								type="button"
								onClick={() => void handleSignOut()}
								disabled={isSigningOut}
								className="flex w-full cursor-default items-center rounded-none px-2 py-1.5 text-left text-[13px] font-medium text-destructive outline-none focus:bg-destructive/10 focus:text-destructive disabled:pointer-events-none disabled:opacity-50"
							>
								{isSigningOut ? (
									<LoaderCircle className="mr-2 h-[15px] w-[15px] animate-spin" />
								) : (
									<LogOut className="mr-2 h-[15px] w-[15px]" strokeWidth={1.75} />
								)}
								<span>Sign out</span>
								<Shortcut value="⌘⌫" />
							</button>
						</div>
					</>
				)}
			</PopoverContent>
		</Popover>
	);
}

export default UserMenu;
