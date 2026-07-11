"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
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
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
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

const MORE_INDEX = primaryItems.length;
const PILL_TRANSITION = {
	type: "spring" as const,
	stiffness: 520,
	damping: 42,
	mass: 0.7,
};

function activeIndexFor(pathname: string) {
	const primary = primaryItems.findIndex((item) => item.match(pathname));
	if (primary !== -1) return primary;
	if (moreItems.some((item) => item.match(pathname))) return MORE_INDEX;
	return -1;
}

function useNavDirection(activeIndex: number) {
	const previousIndex = useRef(activeIndex);
	const direction = useRef(0);

	if (activeIndex !== previousIndex.current) {
		if (activeIndex !== -1 && previousIndex.current !== -1) {
			direction.current = activeIndex > previousIndex.current ? 1 : -1;
		} else {
			direction.current = 0;
		}
		previousIndex.current = activeIndex;
	}

	return direction.current;
}

const baseSlotClass =
	"relative flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md text-[11px] font-medium transition-colors";

function ActivePill() {
	return (
		<motion.span
			layoutId="mobile-nav-active-pill"
			aria-hidden
			transition={PILL_TRANSITION}
			className="absolute inset-0 -z-10 rounded-md bg-sidebar-accent"
		/>
	);
}

type SlotContentProps = {
	Icon: LucideIcon;
	label: string;
	active: boolean;
	direction: number;
	reducedMotion: boolean;
};

function SlotContent({ Icon, label, active, direction, reducedMotion }: SlotContentProps) {
	return (
		<motion.span
			key={active ? "active" : "idle"}
			className="flex flex-col items-center justify-center gap-0.5"
			initial={active && !reducedMotion ? { x: direction * 10, scale: 0.94 } : false}
			animate={{ x: 0, scale: active ? 1 : 0.98 }}
			transition={PILL_TRANSITION}
		>
			<Icon className="size-4" strokeWidth={1.7} />
			<span className="max-w-full truncate">{label}</span>
		</motion.span>
	);
}

type MobileNavLinkProps = {
	item: MobileNavItem;
	active: boolean;
	direction: number;
	reducedMotion: boolean;
};

function MobileNavLink({ item, active, direction, reducedMotion }: MobileNavLinkProps) {
	return (
		<Link
			href={item.href}
			prefetch
			aria-current={active ? "page" : undefined}
			onClick={() => {
				if (!active) triggerNativeFeedback("selection");
			}}
			className={cn(
				baseSlotClass,
				active
					? "text-sidebar-accent-foreground"
					: "text-muted-foreground hover:bg-muted hover:text-foreground",
			)}
		>
			{active ? <ActivePill /> : null}
			<SlotContent
				Icon={item.Icon}
				label={item.label}
				active={active}
				direction={direction}
				reducedMotion={reducedMotion}
			/>
		</Link>
	);
}

export function MobileAppNav() {
	const pathname = usePathname();
	const [menuOpen, setMenuOpen] = useState(false);
	const reducedMotion = useReducedMotion() ?? false;
	const activeIndex = activeIndexFor(pathname);
	const direction = useNavDirection(activeIndex);
	const moreActive = activeIndex === MORE_INDEX;

	useEffect(() => {
		if (menuOpen) triggerNativeFeedback("selection");
	}, [menuOpen]);

	return (
		<nav
			aria-label="Primary app navigation"
			className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/96 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-16px_30px_hsl(var(--scrim)_/_0.18)] backdrop-blur md:hidden"
		>
			<LayoutGroup id="mobile-app-nav">
				<div className="mx-auto flex max-w-md items-center gap-1">
					{primaryItems.map((item, index) => (
						<MobileNavLink
							key={item.href}
							item={item}
							active={index === activeIndex}
							direction={direction}
							reducedMotion={reducedMotion}
						/>
					))}

					<DropdownMenu onOpenChange={setMenuOpen}>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								aria-label="More app destinations"
								aria-pressed={moreActive}
								className={cn(
									baseSlotClass,
									moreActive
										? "text-sidebar-accent-foreground"
										: "text-muted-foreground hover:bg-muted hover:text-foreground",
								)}
							>
								{moreActive ? <ActivePill /> : null}
								<SlotContent
									Icon={Ellipsis}
									label="More"
									active={moreActive}
									direction={direction}
									reducedMotion={reducedMotion}
								/>
							</button>
						</DropdownMenuTrigger>
						{menuOpen ? (
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
										<DropdownMenuItem
											key={item.href}
											asChild
											className="rounded-md"
										>
											<Link
												href={item.href}
												prefetch
												aria-current={active ? "page" : undefined}
												onClick={() => {
													if (!active) triggerNativeFeedback("selection");
												}}
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
										triggerNativeFeedback("selection");
										openSettings();
									}}
								>
									<Settings2 className="size-4" strokeWidth={1.7} />
									Settings
								</DropdownMenuItem>
							</DropdownMenuContent>
						) : null}
					</DropdownMenu>
				</div>
			</LayoutGroup>
		</nav>
	);
}
