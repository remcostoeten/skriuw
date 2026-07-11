"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { Activity, FilePlus, Pencil, Trash2, type LucideIcon } from "lucide-react";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import { IconRail } from "@/features/layout/components/icon-rail";
import { NotesEmptyState } from "@/features/notes/components/notes-empty-state";
import { useNotes } from "@/features/notes/hooks/use-notes";
import { useTrash } from "@/features/notes/hooks/use-trash";
import { cn } from "@/shared/lib/utils";
import { ActivityScrubber } from "./activity-scrubber";
import {
	buildActivityEntries,
	groupActivityByTime,
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

function entryHref(entry: ActivityEntry): string {
	if (entry.kind === "deleted") return "/app/trash";
	if (!entry.noteId) return "/app";
	return `/app?note=${encodeURIComponent(entry.noteId)}`;
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
	const Icon = KIND_ICON[entry.kind];
	const ariaLabel = format(entry.timestamp, "PPpp");

	return (
		<li data-activity-ts={entry.timestamp.toISOString()}>
			<Link
				href={entryHref(entry)}
				className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/60"
			>
				<span
					className={cn(
						"flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border",
						entry.kind === "deleted" ? "text-destructive" : "text-muted-foreground",
					)}
				>
					<Icon className="h-4 w-4" strokeWidth={1.6} />
				</span>
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-medium text-foreground">{entry.name}</p>
					<p className="text-xs text-muted-foreground">{KIND_LABEL[entry.kind]}</p>
				</div>
				<time
					dateTime={entry.timestamp.toISOString()}
					aria-label={ariaLabel}
					suppressHydrationWarning
					className="shrink-0 text-xs tabular-nums text-muted-foreground"
				>
					{formatDistanceToNow(entry.timestamp, { addSuffix: true })}
				</time>
			</Link>
		</li>
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

	const buckets = useMemo(() => {
		if (!now) return [];
		const entries = buildActivityEntries(notes, trash);
		return groupActivityByTime(entries, now);
	}, [notes, trash, now]);

	const isEmpty = buckets.length === 0;
	const totalEntries = buckets.reduce((sum, bucket) => sum + bucket.entries.length, 0);

	return (
		<LayoutContainer className="bg-background">
			<div className="relative flex min-h-0 flex-1 overflow-hidden">
				<IconRail />
				<div className="mx-auto flex h-full w-full max-w-3xl flex-col">
					<header className="border-b border-border px-6 py-5">
						<h1 className="text-base font-semibold text-foreground">Activity</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Recent changes across your notes — what you created, edited, and
							deleted, newest first.
						</p>
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
								{buckets.map((bucket) => (
									<section
										key={bucket.id}
										data-bucket-id={bucket.id}
										data-bucket-label={bucket.label}
									>
										<h2 className="sticky top-0 z-10 bg-background/95 px-6 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
											{bucket.label}
										</h2>
										<ul className="divide-y divide-border">
											{bucket.entries.map((entry) => (
												<ActivityRow key={entry.id} entry={entry} />
											))}
										</ul>
									</section>
								))}
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
