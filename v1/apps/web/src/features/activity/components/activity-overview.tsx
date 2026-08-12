"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { Activity, FilePlus, Pencil, Trash2, type LucideIcon } from "lucide-react";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import { NotesEmptyState } from "@/features/notes/components/notes-empty-state";
import { useNotes } from "@/features/notes/hooks/use-notes";
import { useTrash } from "@/features/notes/hooks/use-trash";
import { cn } from "@/shared/lib/utils";
import { ActivityScrubber } from "./activity-scrubber";
import {
	buildActivityEntries,
	countActivityByKind,
	groupActivityByDay,
	type ActivityEntry,
	type ActivityKind,
} from "../lib/build-activity";

const KIND_ICON: Record<ActivityKind, LucideIcon> = {
	created: FilePlus,
	edited: Pencil,
	deleted: Trash2,
};

const KIND_LABEL: Record<ActivityKind, string> = {
	created: "Created",
	edited: "Edited",
	deleted: "Deleted",
};

const KIND_NODE_CLASS: Record<ActivityKind, string> = {
	created: "border-primary/30 bg-primary/10 text-primary",
	edited: "border-border bg-muted text-muted-foreground",
	deleted: "border-destructive/30 bg-destructive/10 text-destructive",
};

const KIND_STAT_CLASS: Record<ActivityKind, string> = {
	created: "text-primary",
	edited: "text-foreground",
	deleted: "text-destructive",
};

function entryHref(entry: ActivityEntry): string {
	if (entry.kind === "deleted") return "/app/trash";
	if (!entry.noteId) return "/app";
	return `/app?note=${encodeURIComponent(entry.noteId)}`;
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
	const Icon = KIND_ICON[entry.kind];
	const iso = entry.timestamp.toISOString();

	return (
		<li data-activity-ts={iso} className="relative">
			<Link
				href={entryHref(entry)}
				className="group/row flex items-start gap-4 rounded-lg py-2.5 pl-0 pr-3 transition-colors hover:bg-muted/60"
			>
				<span
					className={cn(
						"relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-transform group-hover/row:scale-105",
						KIND_NODE_CLASS[entry.kind],
					)}
				>
					<Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
				</span>
				<div className="min-w-0 flex-1 pt-0.5">
					<p className="truncate text-sm font-medium text-foreground">{entry.name}</p>
					<p className="mt-0.5 text-xs text-muted-foreground">
						{KIND_LABEL[entry.kind]}
						<span className="px-1.5 text-border">·</span>
						<span suppressHydrationWarning>
							{formatDistanceToNow(entry.timestamp, { addSuffix: true })}
						</span>
					</p>
				</div>
				<time
					dateTime={iso}
					aria-label={format(entry.timestamp, "PPpp")}
					suppressHydrationWarning
					className="shrink-0 pt-1 text-xs tabular-nums text-muted-foreground/80"
				>
					{format(entry.timestamp, "HH:mm")}
				</time>
			</Link>
		</li>
	);
}

function StatChip({ kind, count }: { kind: ActivityKind; count: number }) {
	const Icon = KIND_ICON[kind];
	return (
		<div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
			<Icon className={cn("h-3.5 w-3.5", KIND_STAT_CLASS[kind])} strokeWidth={1.8} />
			<span className="text-sm font-semibold tabular-nums text-foreground">{count}</span>
			<span className="text-xs text-muted-foreground">{KIND_LABEL[kind].toLowerCase()}</span>
		</div>
	);
}

export function ActivityOverview() {
	const { data: notes = [], isPending: notesLoading } = useNotes();
	const { data: trash = [] } = useTrash();
	const scrollRef = useRef<HTMLDivElement>(null);
	const scrollRegionId = useId();

	// Reading the clock during SSR makes the prerender non-deterministic, which
	// cacheComponents rejects; bucket relative to a mount-time clock instead.
	const [now, setNow] = useState<Date | null>(null);
	useEffect(() => {
		setNow(new Date());
	}, []);

	const { days, stats, totalEntries } = useMemo(() => {
		if (!now) {
			return {
				days: [],
				stats: { created: 0, edited: 0, deleted: 0 },
				totalEntries: 0,
			};
		}
		const entries = buildActivityEntries(notes, trash);
		return {
			days: groupActivityByDay(entries, now),
			stats: countActivityByKind(entries),
			totalEntries: entries.length,
		};
	}, [notes, trash, now]);

	const isEmpty = days.length === 0;

	return (
		<LayoutContainer className="bg-background">
			<div className="relative flex min-h-0 flex-1 overflow-hidden">
				<div className="mx-auto flex h-full w-full max-w-3xl flex-col">
					<header className="border-b border-border px-6 py-5">
						<h1 className="text-base font-semibold text-foreground">Activity</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Recent changes across your notes — what you created, edited, and
							deleted, newest first.
						</p>
						{!isEmpty ? (
							<div className="mt-3 flex flex-wrap gap-2">
								<StatChip kind="created" count={stats.created} />
								<StatChip kind="edited" count={stats.edited} />
								<StatChip kind="deleted" count={stats.deleted} />
							</div>
						) : null}
					</header>

					{notesLoading || !now ? null : isEmpty ? (
						<NotesEmptyState
							icon={Activity}
							title="No activity yet"
							description="Create or edit a note and it shows up here."
						/>
					) : (
						<div className="relative min-h-0 flex-1">
							<div
								id={scrollRegionId}
								ref={scrollRef}
								className="h-full overflow-y-auto pr-2"
							>
								<div className="px-6 pb-8">
									{days.map((day) => (
										<section
											key={day.id}
											data-bucket-id={day.id}
											data-bucket-label={day.label}
										>
											<h2 className="sticky top-0 z-10 flex items-baseline gap-2 bg-background/95 py-2.5 backdrop-blur">
												<span className="text-sm font-semibold text-foreground">
													{day.label}
												</span>
												<span className="text-xs text-muted-foreground">
													{day.sublabel}
												</span>
												<span className="ml-auto rounded-full border border-border px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
													{day.entries.length}
												</span>
											</h2>
											<div className="relative">
												<span
													aria-hidden
													className="absolute bottom-2 left-4 top-2 w-px bg-border"
												/>
												<ul>
													{day.entries.map((entry) => (
														<ActivityRow key={entry.id} entry={entry} />
													))}
												</ul>
											</div>
										</section>
									))}
								</div>
							</div>
							<ActivityScrubber
								scrollRef={scrollRef}
								scrollRegionId={scrollRegionId}
								revision={totalEntries}
							/>
						</div>
					)}
				</div>
			</div>
		</LayoutContainer>
	);
}
