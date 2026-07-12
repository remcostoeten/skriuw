"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
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
	X,
	type LucideIcon,
} from "lucide-react";
import { openSettings } from "@/features/settings/use-settings-modal";
import { useFocusTrap } from "@/shared/hooks/use-focus-trap";
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
	"group relative isolate flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md text-[11px] font-medium transition-colors";

function HoverPill({ origin }: { origin: "left" | "right" | "center" }) {
	return (
		<span
			aria-hidden
			className={cn(
				"pointer-events-none absolute inset-0 -z-10 scale-x-[0.72] rounded-md bg-muted opacity-0 transition-[transform,opacity] duration-150 ease-out group-hover:scale-x-100 group-hover:opacity-100 motion-reduce:transform-none",
				origin === "left"
					? "origin-left"
					: origin === "right"
						? "origin-right"
						: "origin-center",
			)}
		/>
	);
}

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
			initial={active && !reducedMotion ? { x: direction * -10, scale: 0.94 } : false}
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
	index: number;
	activeIndex: number;
	active: boolean;
	direction: number;
	reducedMotion: boolean;
};

function MobileNavLink({
	item,
	index,
	activeIndex,
	active,
	direction,
	reducedMotion,
}: MobileNavLinkProps) {
	const hoverOrigin =
		activeIndex === -1 || index === activeIndex
			? "center"
			: index > activeIndex
				? "left"
				: "right";

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
			{active ? null : <HoverPill origin={hoverOrigin} />}
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
	const menuRef = useRef<HTMLDivElement>(null);
	const reducedMotion = useReducedMotion() ?? false;
	const activeIndex = activeIndexFor(pathname);
	const direction = useNavDirection(activeIndex);
	const moreActive = activeIndex === MORE_INDEX;
	const moreHoverOrigin =
		activeIndex === -1 || moreActive ? "center" : MORE_INDEX > activeIndex ? "left" : "right";

	useEffect(() => {
		if (menuOpen) triggerNativeFeedback("selection");
	}, [menuOpen]);
	useFocusTrap(menuOpen, menuRef);

	useEffect(() => {
		setMenuOpen(false);
	}, [pathname]);

	useEffect(() => {
		if (!menuOpen) return;
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") setMenuOpen(false);
		};
		document.addEventListener("keydown", closeOnEscape);
		return () => document.removeEventListener("keydown", closeOnEscape);
	}, [menuOpen]);

	return (
		<>
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
								index={index}
								activeIndex={activeIndex}
								active={index === activeIndex}
								direction={direction}
								reducedMotion={reducedMotion}
							/>
						))}

						<button
							type="button"
							aria-label="More app destinations"
							aria-expanded={menuOpen}
							aria-controls="mobile-more-panel"
							onClick={() => setMenuOpen(true)}
							className={cn(
								baseSlotClass,
								moreActive
									? "text-sidebar-accent-foreground"
									: "text-muted-foreground hover:bg-muted hover:text-foreground",
							)}
						>
							{moreActive ? <ActivePill /> : null}
							{moreActive ? null : <HoverPill origin={moreHoverOrigin} />}
							<SlotContent
								Icon={Ellipsis}
								label="More"
								active={moreActive}
								direction={direction}
								reducedMotion={reducedMotion}
							/>
						</button>
					</div>
				</LayoutGroup>
			</nav>

			<AnimatePresence>
				{menuOpen ? (
					<div className="fixed inset-0 z-50 md:hidden">
						<motion.button
							type="button"
							aria-label="Close more destinations"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{
								duration: reducedMotion ? 0.12 : 0.2,
								ease: "easeOut",
							}}
							className="absolute inset-0 bg-scrim/58"
							onClick={() => setMenuOpen(false)}
						/>
						<motion.div
							id="mobile-more-panel"
							ref={menuRef}
							role="dialog"
							aria-modal="true"
							aria-labelledby="mobile-more-title"
							initial={reducedMotion ? { opacity: 0, y: 16 } : { y: "100%" }}
							animate={{ opacity: 1, y: 0 }}
							exit={reducedMotion ? { opacity: 0, y: 12 } : { y: "100%" }}
							transition={{
								duration: reducedMotion ? 0.16 : 0.5,
								ease: [0.32, 0.72, 0, 1],
							}}
							drag={reducedMotion ? false : "y"}
							dragConstraints={{ top: 0, bottom: 0 }}
							dragElastic={{ top: 0.04, bottom: 0.18 }}
							onDragEnd={(_, info) => {
								if (info.offset.y > 80 || info.velocity.y > 500) setMenuOpen(false);
							}}
							className="native-panel absolute inset-x-0 bottom-0 max-h-[min(72dvh,32rem)] overflow-y-auto rounded-t-2xl border-x-0 border-b-0 px-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl touch-pan-x"
						>
							<div className="drag-handle sticky top-0 z-10 bg-card pb-2 pt-2" />
							<div className="mb-3 flex items-center justify-between px-1">
								<h2 id="mobile-more-title" className="text-base font-semibold">
									More
								</h2>
								<button
									type="button"
									onClick={() => setMenuOpen(false)}
									className="pressable-soft flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
									aria-label="Close more destinations"
								>
									<X className="size-5" />
								</button>
							</div>
							<div className="grid grid-cols-2 gap-2">
								{moreItems.map((item) => {
									const active = item.match(pathname);
									const Icon = item.Icon;
									return (
										<Link
											key={item.href}
											href={item.href}
											prefetch
											aria-current={active ? "page" : undefined}
											onClick={() =>
												!active && triggerNativeFeedback("selection")
											}
											className={cn(
												"pressable-soft flex min-h-16 items-center gap-3 rounded-xl border border-border p-3 text-sm font-medium transition-colors",
												active
													? "bg-sidebar-accent text-sidebar-accent-foreground"
													: "bg-background hover:bg-muted",
											)}
										>
											<Icon className="size-5" strokeWidth={1.7} />
											{item.label}
										</Link>
									);
								})}
							</div>
							<button
								type="button"
								className="pressable-soft mt-3 flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium hover:bg-muted"
								onClick={() => {
									setMenuOpen(false);
									triggerNativeFeedback("selection");
									openSettings();
								}}
							>
								<Settings2 className="size-5" strokeWidth={1.7} />
								Settings
							</button>
						</motion.div>
					</div>
				) : null}
			</AnimatePresence>
		</>
	);
}
