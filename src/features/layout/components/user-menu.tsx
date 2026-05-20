"use client";

import * as React from "react";
import { FileText, BookOpen, Activity, Settings, LogOut, LoaderCircle } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { getAvatarSeed } from "@/shared/lib/avatar";
import { AvatarFace } from "@/shared/icons/avatar-face";
import { usePreferencesStore } from "@/features/settings/store";
import { cn } from "@/shared/lib/utils";

export type UserMenuProps = {
	onSettings: () => void;
	onSignOut: () => void;
	onNotes?: () => void;
	onJournal?: () => void;
	onActivity?: () => void;
};

function Shortcut({ value }: { value: string }) {
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

export function UserMenu({ onSettings, onSignOut, onNotes, onJournal, onActivity }: UserMenuProps) {
	const [open, setOpen] = React.useState(false);
	const [isSigningOut, setIsSigningOut] = React.useState(false);
	const avatarColor = usePreferencesStore((state) => state.profile.avatarColor);

	const handleSignOut = async () => {
		setIsSigningOut(true);
		try {
			await onSignOut();
		} finally {
			setIsSigningOut(false);
		}
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger
				className="pressable flex h-9 w-9 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground/78 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
				aria-label="User menu"
			>
				<AvatarFace
					name={getAvatarSeed("", "account-user")}
					size={36}
					color={avatarColor ?? undefined}
					className="h-full w-full"
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				side="right"
				sideOffset={8}
				className="w-60 rounded-none border border-border bg-popover p-1 text-popover-foreground shadow-[0_20px_50px_-10px_hsl(var(--scrim)/0.7)]"
			>
				<div className="py-1">
					{[
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
					].map((item) => {
						const Icon = item.icon;
						return (
							<DropdownMenuItem
								key={item.key}
								onSelect={item.onSelect}
								className={cn(
									"group/item cursor-default rounded-none px-2 py-1.5 text-[13px] font-medium",
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
								{item.shortcut ? <Shortcut value={item.shortcut} /> : null}
							</DropdownMenuItem>
						);
					})}
				</div>

				<DropdownMenuSeparator className="my-0 -mx-1 h-px bg-border" />
				<div className="py-1">
					<DropdownMenuItem
						onSelect={handleSignOut}
						disabled={isSigningOut}
						className="cursor-default rounded-none px-2 py-1.5 text-[13px] font-medium text-destructive focus:bg-destructive/10 focus:text-destructive"
					>
						{isSigningOut ? (
							<LoaderCircle className="mr-2 h-[15px] w-[15px] animate-spin" />
						) : (
							<LogOut className="mr-2 h-[15px] w-[15px]" strokeWidth={1.75} />
						)}
						<span>Sign out</span>
						<Shortcut value="⌘⌫" />
					</DropdownMenuItem>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export default UserMenu;
