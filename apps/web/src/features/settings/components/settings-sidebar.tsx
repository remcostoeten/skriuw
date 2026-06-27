"use client";

import {
	Database,
	Eye,
	FlaskConical,
	Keyboard,
	Palette,
	PenLine,
	Share2,
	Shield,
	Sparkles,
	Tag,
	User,
	type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { cn } from "@/shared/lib/utils";
import { useAuth } from "@/core/auth/use-auth";
import { isAdmin } from "@/lib/roles";
import { isTauriRuntime } from "@/core/workspace-backend";

export type SettingsTabId =
	| "account"
	| "appearance"
	| "editor"
	| "shortcuts"
	| "data"
	| "privacy"
	| "security"
	| "ai"
	| "tags"
	| "experimental";

type SettingsNavItem = {
	id: SettingsTabId;
	label: string;
	icon: LucideIcon;
};

const NAV_ITEMS: ReadonlyArray<SettingsNavItem> = [
	{ id: "account", label: "Account", icon: User },
	{ id: "appearance", label: "Appearance", icon: Palette },
	{ id: "editor", label: "Editor", icon: PenLine },
	{ id: "shortcuts", label: "Shortcuts", icon: Keyboard },
	{ id: "data", label: "Data & sync", icon: Database },
	{ id: "privacy", label: "Privacy", icon: Eye },
	{ id: "security", label: "Security", icon: Shield },
	{ id: "ai", label: "AI", icon: Sparkles },
	{ id: "tags", label: "Tags", icon: Tag },
	{ id: "experimental", label: "Experimental", icon: FlaskConical },
];

// Cloud-only tabs hidden in the desktop build: there is no cloud auth (account/
// security). AI stays visible — desktop runs local Ollama or a direct cloud key.
// Exported so the page can also redirect away from these ids if reached via a
// stale ?tab= URL.
export const DESKTOP_HIDDEN_TABS: ReadonlySet<SettingsTabId> = new Set([
	"account",
	"security",
]);

export function isSettingsTabVisible(id: SettingsTabId): boolean {
	return !(isTauriRuntime() && DESKTOP_HIDDEN_TABS.has(id));
}

export const SETTINGS_TABPANEL_ID = "settings-tabpanel";

export function getSettingsTabId(id: SettingsTabId): string {
	return `settings-tab-${id}`;
}

const tabClassName = cn(
	"flex w-full items-center gap-2 border border-transparent px-2.5 py-2 text-left text-[12px] font-medium transition-colors",
	"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
);

type SettingsSidebarProps = {
	activeTab: SettingsTabId;
	onSelectTab: (tab: SettingsTabId) => void;
	className?: string;
};

export function SettingsSidebar({ activeTab, onSelectTab, className }: SettingsSidebarProps) {
	const auth = useAuth();
	const userIsAdmin = isAdmin(auth.user?.role);
	const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

	const visibleItems = NAV_ITEMS.filter((item) => isSettingsTabVisible(item.id));

	function moveFocusTo(index: number) {
		const count = visibleItems.length;
		if (count === 0) return;
		const nextIndex = (index + count) % count;
		tabRefs.current[nextIndex]?.focus();
		onSelectTab(visibleItems[nextIndex].id);
	}

	return (
		<div
			className={cn(
				"flex h-full w-full shrink-0 flex-col border-r border-border bg-background",
				className,
			)}
		>
			<div className="flex h-11 items-center border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground">
				<h2 className="text-sm font-semibold text-foreground">Settings</h2>
			</div>

			<nav
				role="tablist"
				aria-orientation="vertical"
				aria-label="Settings sections"
				className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2"
			>
				{visibleItems.map((item, index) => {
					const isActive = item.id === activeTab;
					const Icon = item.icon;
					return (
						<button
							key={item.id}
							ref={(el) => {
								tabRefs.current[index] = el;
							}}
							type="button"
							role="tab"
							id={getSettingsTabId(item.id)}
							aria-selected={isActive}
							aria-controls={SETTINGS_TABPANEL_ID}
							tabIndex={isActive ? 0 : -1}
							onClick={() => onSelectTab(item.id)}
							onKeyDown={(event) => {
								switch (event.key) {
									case "ArrowDown":
									case "ArrowRight":
										event.preventDefault();
										moveFocusTo(index + 1);
										break;
									case "ArrowUp":
									case "ArrowLeft":
										event.preventDefault();
										moveFocusTo(index - 1);
										break;
									case "Home":
										event.preventDefault();
										moveFocusTo(0);
										break;
									case "End":
										event.preventDefault();
										moveFocusTo(visibleItems.length - 1);
										break;
								}
							}}
							className={cn(
								tabClassName,
								isActive
									? "border-border bg-muted text-foreground"
									: "text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
							)}
						>
							<Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
							<span className="truncate">{item.label}</span>
						</button>
					);
				})}
			</nav>

			<div className="space-y-0.5 border-t border-border p-2">
				<Link
					href="/app/shared"
					className={cn(
						tabClassName,
						"text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
					)}
				>
					<Share2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
					<span className="truncate">Shared notes</span>
				</Link>
				{userIsAdmin && (
					<Link
						href="/admin"
						className={cn(
							tabClassName,
							"text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
						)}
					>
						<Shield className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
						<span className="truncate">Admin</span>
					</Link>
				)}
			</div>
		</div>
	);
}
