"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	Activity,
	BookOpen,
	Ellipsis,
	FolderOpen,
	Hash,
	Settings2,
	Share2,
	Trash2,
	Users,
	Waypoints,
	type LucideIcon,
} from "lucide-react";
import { openSettings } from "@/features/settings/use-settings-modal";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";

type MobileNavItem = {
	href: string;
	label: string;
	Icon: LucideIcon;
	match: (pathname: string) => boolean;
};

const primaryItems: MobileNavItem[] = [
	{
		href: "/app",
		label: "Notes",
		Icon: FolderOpen,
		match: (pathname) => pathname === "/app",
	},
	{
		href: "/app/journal",
		label: "Journal",
		Icon: BookOpen,
		match: (pathname) => pathname === "/app/journal",
	},
	{
		href: "/app/graph",
		label: "Graph",
		Icon: Waypoints,
		match: (pathname) => pathname === "/app/graph",
	},
	{
		href: "/app/tags",
		label: "Tags",
		Icon: Hash,
		match: (pathname) => pathname.startsWith("/app/tags"),
	},
];

const moreItems: MobileNavItem[] = [
	{
		href: "/app/people",
		label: "People",
		Icon: Users,
		match: (pathname) => pathname.startsWith("/app/people"),
	},
	{
		href: "/app/activity",
		label: "Activity",
		Icon: Activity,
		match: (pathname) => pathname.startsWith("/app/activity"),
	},
	{
		href: "/app/shared",
		label: "Shared",
		Icon: Share2,
		match: (pathname) => pathname === "/app/shared",
	},
	{
		href: "/app/trash",
		label: "Trash",
		Icon: Trash2,
		match: (pathname) => pathname === "/app/trash",
	},
];

function MobileNavLink({ item }: { item: MobileNavItem }) {
	const pathname = usePathname();
	const active = item.match(pathname);
	const Icon = item.Icon;

	return (
		<Link
			href={item.href}
			prefetch
			aria-current={active ? "page" : undefined}
			className={cn(
				"flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md text-[11px] font-medium transition-colors",
				active
					? "bg-sidebar-accent text-sidebar-accent-foreground"
					: "text-muted-foreground hover:bg-muted hover:text-foreground",
			)}
		>
			<Icon className="size-4" strokeWidth={1.7} />
			<span className="max-w-full truncate">{item.label}</span>
		</Link>
	);
}

export function MobileAppNav() {
	const pathname = usePathname();
	const moreActive = moreItems.some((item) => item.match(pathname));

	return (
		<nav
			aria-label="Primary app navigation"
			className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/96 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-16px_30px_hsl(var(--scrim)_/_0.18)] backdrop-blur md:hidden"
		>
			<div className="mx-auto flex max-w-md items-center gap-1">
				{primaryItems.map((item) => (
					<MobileNavLink key={item.href} item={item} />
				))}

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label="More app destinations"
							aria-pressed={moreActive}
							className={cn(
								"flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md text-[11px] font-medium transition-colors",
								moreActive
									? "bg-sidebar-accent text-sidebar-accent-foreground"
									: "text-muted-foreground hover:bg-muted hover:text-foreground",
							)}
						>
							<Ellipsis className="size-4" strokeWidth={1.7} />
							<span>More</span>
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="end"
						side="top"
						sideOffset={10}
						className="mb-1 w-48 rounded-lg p-1.5 shadow-xl"
					>
						{moreItems.map((item) => {
							const active = item.match(pathname);
							const Icon = item.Icon;
							return (
								<DropdownMenuItem key={item.href} asChild className="rounded-md">
									<Link
										href={item.href}
										prefetch
										aria-current={active ? "page" : undefined}
										className={cn(active && "bg-muted text-foreground")}
									>
										<Icon className="size-4" strokeWidth={1.7} />
										{item.label}
									</Link>
								</DropdownMenuItem>
							);
						})}
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="rounded-md"
							onSelect={(event) => {
								event.preventDefault();
								openSettings();
							}}
						>
							<Settings2 className="size-4" strokeWidth={1.7} />
							Settings
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</nav>
	);
}
