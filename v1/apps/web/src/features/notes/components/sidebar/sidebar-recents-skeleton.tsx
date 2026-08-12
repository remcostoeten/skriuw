"use client";

import { useSyncExternalStore } from "react";
import { SidebarItemIcon } from "./sidebar-item-icon";
import { useSidebarStore } from "./store";

const RECENTS_SKELETON_LIMIT = 6;

type Props = {
	fallback: React.ReactNode;
};

function subscribeNoop() {
	return () => {};
}

export function SidebarRecentsSkeleton({ fallback }: Props) {
	const isHydrated = useSyncExternalStore(
		subscribeNoop,
		() => true,
		() => false,
	);
	const recents = useSidebarStore((state) => state.config.recents);
	const named = isHydrated
		? recents.filter((recent) => Boolean(recent.name)).slice(0, RECENTS_SKELETON_LIMIT)
		: [];

	if (named.length === 0) {
		return fallback;
	}

	return (
		<div className="space-y-px px-1 pb-2 pt-0.5">
			{named.map((recent) => (
				<div
					key={recent.id}
					className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-xs text-foreground/60"
				>
					{recent.icon ? (
						<span
							className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[13px] leading-none"
							aria-hidden
						>
							{recent.icon}
						</span>
					) : recent.itemType === "folder" ? (
						<SidebarItemIcon
							kind="folder"
							size={14}
							className="shrink-0 text-muted-foreground/70"
						/>
					) : null}
					<span className="flex-1 truncate">{recent.name}</span>
				</div>
			))}
		</div>
	);
}
