"use client";

import { useEffect, useState } from "react";
import type { Awareness } from "y-protocols/awareness";
import { useLazyRef } from "@/shared/lib/use-lazy-ref";
import { AvatarFace } from "@/shared/icons/avatar-face";
import { cn } from "@/shared/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { useCollabPresence, type TCollabPeer } from "../hooks/use-collab-presence";
import type { TCollabRole } from "../lib/collab-activity";

const MAX_VISIBLE = 4;
/** Cap on the ephemeral in-session activity feed. */
const MAX_ACTIVITY = 6;

const ROLE_LABEL: Record<TCollabRole, string> = {
	owner: "Owner",
	editor: "Editor",
	viewer: "Viewer",
};

function relativeTime(ms: number | null, now: number): string {
	if (ms == null) return "";
	const diff = Math.max(0, now - ms);
	if (diff < 45_000) return "just now";
	const mins = Math.round(diff / 60_000);
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.round(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.round(hours / 24)}d ago`;
}

function statusLabel(peer: TCollabPeer, now: number): string {
	if (peer.status === "typing") return "typing…";
	if (peer.status === "active") return "active now";
	const rel = relativeTime(peer.lastActive, now);
	return rel ? `edited ${rel}` : "idle";
}

type TActivityEntry = { id: string; name: string; color: string; at: number };

/**
 * Builds an ephemeral "recent edits" feed by watching peers' `lastActive`
 * timestamps climb. Resets when the editor remounts — it's a live overview,
 * not durable history.
 */
function useActivityFeed(peers: TCollabPeer[]): TActivityEntry[] {
	const seen = useLazyRef(() => new Map<number, number>());
	const [feed, setFeed] = useState<TActivityEntry[]>([]);

	useEffect(() => {
		let changed = false;
		const additions: TActivityEntry[] = [];
		for (const peer of peers) {
			if (peer.lastActive == null) continue;
			const prev = seen.current.get(peer.clientId);
			if (prev === undefined) {
				// First sighting: remember the baseline without logging it, so we
				// don't flood the feed with "edited" lines for everyone on join.
				seen.current.set(peer.clientId, peer.lastActive);
				continue;
			}
			if (peer.lastActive > prev) {
				seen.current.set(peer.clientId, peer.lastActive);
				changed = true;
				additions.push({
					id: `${peer.clientId}-${peer.lastActive}`,
					name: peer.isSelf ? `${peer.name} (you)` : peer.name,
					color: peer.color,
					at: peer.lastActive,
				});
			}
		}
		if (changed) {
			setFeed((prev) => [...additions, ...prev].slice(0, MAX_ACTIVITY));
		}
	}, [peers]);

	return feed;
}

function StatusDot({ status, color }: { status: TCollabPeer["status"]; color: string }) {
	return (
		<span className="relative flex h-2 w-2 shrink-0">
			{status === "typing" && (
				<span
					className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
					style={{ backgroundColor: color }}
				/>
			)}
			<span
				className="relative inline-flex h-2 w-2 rounded-full"
				style={{
					backgroundColor: status === "idle" ? "transparent" : color,
					boxShadow: `inset 0 0 0 1.5px ${color}`,
				}}
			/>
		</span>
	);
}

/**
 * Live avatar stack of everyone currently in the collaboration room. Renders
 * nothing until at least one peer is present, so it stays invisible on
 * non-collaborative notes. Clicking opens a lobby overview: who's here, their
 * role, what they're doing, and a feed of recent edits. The local user is
 * shown with a subtle ring.
 */
export function CollabPresence({ awareness }: { awareness: Awareness | null | undefined }) {
	const peers = useCollabPresence(awareness);
	const activity = useActivityFeed(peers);
	const [open, setOpen] = useState(false);
	const [now, setNow] = useState(() => Date.now());

	// Keep relative labels fresh while the popover is open.
	useEffect(() => {
		if (!open) return;
		setNow(Date.now());
		const interval = window.setInterval(() => setNow(Date.now()), 5_000);
		return () => window.clearInterval(interval);
	}, [open]);

	if (peers.length === 0) return null;

	const visible = peers.slice(0, MAX_VISIBLE);
	const overflow = peers.length - visible.length;
	const summary = peers.map((p) => (p.isSelf ? `${p.name} (you)` : p.name)).join(", ");
	const heading = `${peers.length} ${peers.length === 1 ? "person" : "people"} here`;
	// "Live" only reads as collaborative when someone other than you is present.
	const othersPresent = peers.some((peer) => !peer.isSelf);
	const someoneTyping = peers.some((peer) => !peer.isSelf && peer.status === "typing");

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"group flex shrink-0 items-center gap-1.5 rounded-full border py-0.5 pl-1 pr-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						othersPresent
							? "border-border bg-muted/50 hover:bg-muted"
							: "border-transparent hover:bg-muted",
					)}
					title={summary}
					aria-label={`${heading}: ${summary}`}
				>
					<span className="flex items-center -space-x-1.5">
						{visible.map((peer) => (
							<span
								key={peer.clientId}
								className={cn(
									"relative inline-flex rounded-full ring-2 ring-background",
									peer.isSelf && "ring-foreground/30",
								)}
								style={{ boxShadow: `0 0 0 1.5px ${peer.color}` }}
							>
								<AvatarFace name={peer.name} color={peer.color} size={22} />
							</span>
						))}
						{overflow > 0 && (
							<span className="relative inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-muted px-1 text-[10px] font-medium text-muted-foreground ring-2 ring-background">
								+{overflow}
							</span>
						)}
					</span>
					{othersPresent && (
						<span className="flex items-center gap-1 pr-1">
							<span className="relative flex h-1.5 w-1.5">
								<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/70" />
								<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
							</span>
							<span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
								{someoneTyping ? "Typing" : "Live"}
							</span>
						</span>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-72 p-0">
				<div className="border-b border-border px-3 py-2.5">
					<p className="text-xs font-semibold text-foreground">{heading}</p>
					<p className="mt-0.5 text-[11px] text-muted-foreground">Live in this note</p>
				</div>
				<ul className="max-h-64 overflow-y-auto py-1">
					{peers.map((peer) => (
						<li key={peer.clientId} className="flex items-center gap-2.5 px-3 py-1.5">
							<span
								className={cn(
									"relative inline-flex shrink-0 rounded-full",
									peer.isSelf && "ring-2 ring-foreground/30",
								)}
								style={{ boxShadow: `0 0 0 1.5px ${peer.color}` }}
							>
								<AvatarFace name={peer.name} color={peer.color} size={26} />
							</span>
							<span className="flex min-w-0 flex-1 flex-col">
								<span className="flex items-center gap-1.5 truncate text-xs font-medium text-foreground">
									<span className="truncate">{peer.name}</span>
									{peer.isSelf && (
										<span className="text-[10px] font-normal text-muted-foreground">
											(you)
										</span>
									)}
									{peer.role && (
										<span className="shrink-0 rounded-full border border-border px-1.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
											{ROLE_LABEL[peer.role]}
										</span>
									)}
								</span>
								<span className="truncate text-[11px] text-muted-foreground">
									{statusLabel(peer, now)}
								</span>
							</span>
							<StatusDot status={peer.status} color={peer.color} />
						</li>
					))}
				</ul>
				{activity.length > 0 && (
					<div className="border-t border-border px-3 py-2">
						<p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
							Recent edits
						</p>
						<ul className="space-y-1">
							{activity.map((entry) => (
								<li
									key={entry.id}
									className="flex items-center gap-2 text-[11px] text-muted-foreground"
								>
									<span
										className="h-1.5 w-1.5 shrink-0 rounded-full"
										style={{ backgroundColor: entry.color }}
									/>
									<span className="truncate text-foreground/80">
										{entry.name}
									</span>
									<span className="ml-auto shrink-0 tabular-nums">
										{relativeTime(entry.at, now)}
									</span>
								</li>
							))}
						</ul>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
