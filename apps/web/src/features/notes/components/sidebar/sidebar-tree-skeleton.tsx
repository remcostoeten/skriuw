/* eslint-disable react-doctor/no-multi-comp */

import {
	eachDayOfInterval,
	endOfMonth,
	endOfWeek,
	format,
	isSameMonth,
	isToday,
	startOfMonth,
	startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, FileText, Folder } from "lucide-react";
import { cn } from "@/shared/lib/utils";

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const SHIMMER_STEP_MS = 70;

function SkeletonLine({
	className,
	style,
	delay = 0,
}: {
	className?: string;
	style?: React.CSSProperties;
	delay?: number;
}) {
	return (
		<div
			aria-hidden="true"
			className={cn(
				"animate-skeleton-shimmer rounded-sm bg-sidebar-foreground/[0.075]",
				className,
			)}
			style={{ animationDelay: `${delay}ms`, ...style }}
		/>
	);
}

type SidebarTreeRowSkeletonProps = {
	index?: number;
	depth?: number;
	kind?: "file" | "folder";
	labelWidth?: number;
	className?: string;
};

export function SidebarTreeRowSkeleton({
	index = 0,
	depth = 0,
	kind = "file",
	labelWidth,
	className,
}: SidebarTreeRowSkeletonProps) {
	const Icon = kind === "folder" ? Folder : FileText;
	const width = labelWidth ?? [68, 52, 74, 44, 61, 58, 48, 70, 55, 63, 42, 66][index % 12];

	return (
		<div
			aria-hidden="true"
			className={cn(
				"flex h-[34px] items-center gap-2 pr-2.5 text-sidebar-foreground/36",
				className,
			)}
			style={{
				paddingLeft: `${12 + depth * 16}px`,
				opacity: Math.max(0.22, 1 - index * 0.04),
			}}
		>
			<Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.45} />
			<SkeletonLine
				className="h-2.5 max-w-full"
				style={{ width: `${width}%` }}
				delay={index * SHIMMER_STEP_MS}
			/>
		</div>
	);
}

function SidebarSectionHeaderSkeleton({ title }: { title: string }) {
	return (
		<div
			aria-hidden="true"
			className="mx-2 mb-0.5 flex min-h-8 items-center gap-1.5 px-2 md:h-7 md:min-h-0"
		>
			<ChevronRight
				className="h-3 w-3 rotate-90 text-muted-foreground/70"
				strokeWidth={1.5}
			/>
			<span className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
				{title}
			</span>
		</div>
	);
}

function JournalSectionSkeleton() {
	// Mirror MiniCalendar's real grid for the current month so the calendar
	// doesn't visibly change month/today when the live component takes over.
	const now = new Date();
	const days = eachDayOfInterval({
		start: startOfWeek(startOfMonth(now), { weekStartsOn: 1 }),
		end: endOfWeek(endOfMonth(now), { weekStartsOn: 1 }),
	});

	return (
		<section aria-hidden="true" className="mx-2 mb-0.5">
			<SidebarSectionHeaderSkeleton title="Journal" />
			<div className="px-2 pb-2 pt-0.5">
				<div className="mb-2 flex items-center gap-1">
					<div className="rounded-sm border border-border bg-muted px-2 py-1 text-[10px] font-medium text-foreground">
						Calendar
					</div>
					<div className="px-2 py-1 text-[10px] font-medium text-muted-foreground">
						Recent
					</div>
				</div>
				<div className="mb-1.5 flex items-center justify-between">
					<div className="flex h-6 w-6 items-center justify-center text-muted-foreground">
						<ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
					</div>
					<span className="text-[11px] font-medium text-foreground/80">
						{format(now, "MMMM yyyy")}
					</span>
					<div className="flex h-6 w-6 items-center justify-center text-muted-foreground">
						<ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
					</div>
				</div>
				<div className="grid grid-cols-7 gap-0">
					{WEEKDAY_LABELS.map((label) => (
						<div
							key={label}
							className="flex h-6 items-center justify-center text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60"
						>
							{label}
						</div>
					))}
				</div>
				<div className="grid grid-cols-7 gap-0">
					{days.map((day) => (
						<div
							key={format(day, "yyyy-MM-dd")}
							className={cn(
								"relative flex h-7 w-full items-center justify-center border border-transparent text-[11px]",
								!isSameMonth(day, now) && "text-muted-foreground/30",
								isSameMonth(day, now) && !isToday(day) && "text-foreground/70",
								isToday(day) &&
									"border-border bg-muted font-medium text-foreground",
							)}
						>
							{format(day, "d")}
						</div>
					))}
				</div>
				<div className="mt-2 rounded-xl border border-sidebar-border/70 bg-sidebar-accent/20 px-3 py-2.5">
					<SkeletonLine className="h-2.5 w-24" />
					<SkeletonLine className="mt-2 h-2 w-full" delay={SHIMMER_STEP_MS} />
				</div>
			</div>
		</section>
	);
}

const FILE_TREE_ROWS: Array<{
	id: string;
	depth: number;
	kind: "file" | "folder";
	labelWidth: number;
}> = [
	{ id: "row-1", depth: 0, kind: "folder", labelWidth: 58 },
	{ id: "row-2", depth: 1, kind: "file", labelWidth: 72 },
	{ id: "row-3", depth: 1, kind: "file", labelWidth: 64 },
	{ id: "row-4", depth: 0, kind: "folder", labelWidth: 52 },
	{ id: "row-5", depth: 1, kind: "file", labelWidth: 68 },
	{ id: "row-6", depth: 0, kind: "file", labelWidth: 76 },
	{ id: "row-7", depth: 0, kind: "file", labelWidth: 48 },
	{ id: "row-8", depth: 0, kind: "file", labelWidth: 61 },
];

export function SidebarTreeSkeleton({
	rowCount = 8,
	className,
}: {
	rowCount?: number;
	className?: string;
}) {
	const rows = FILE_TREE_ROWS.slice(0, rowCount);

	return (
		<div aria-hidden="true" className={cn("px-1.5 pt-1", className)}>
			{rows.map((row, index) => (
				<SidebarTreeRowSkeleton
					key={row.id}
					index={index}
					depth={row.depth}
					kind={row.kind}
					labelWidth={row.labelWidth}
				/>
			))}
		</div>
	);
}

export function NotesSidebarContentSkeleton() {
	return (
		<div
			aria-hidden="true"
			className="flex-1 overflow-hidden pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2 md:pb-0"
		>
			<section className="mx-2 mb-0.5">
				<SidebarTreeSkeleton rowCount={8} />
			</section>

			<JournalSectionSkeleton />

			<section aria-hidden="true" className="mx-2 mb-0.5">
				<SidebarSectionHeaderSkeleton title="Recents" />
				<div className="space-y-px px-1.5 pb-2 pt-0.5">
					{Array.from({ length: 3 }).map((_, index) => (
						<SidebarTreeRowSkeleton
							key={index}
							index={index}
							labelWidth={[62, 54, 70][index]}
						/>
					))}
				</div>
			</section>

			<section aria-hidden="true" className="mx-2 mb-0.5">
				<SidebarSectionHeaderSkeleton title="Projects" />
				<div className="space-y-1 px-2 pb-2 pt-0.5">
					{Array.from({ length: 2 }).map((_, index) => (
						<div key={index} className="flex items-center gap-2 px-1 py-1.5">
							<div className="h-2 w-2 shrink-0 rounded-full bg-sidebar-foreground/[0.12]" />
							<SkeletonLine
								className="h-2.5"
								style={{ width: `${[48, 56][index]}%` }}
								delay={index * SHIMMER_STEP_MS}
							/>
						</div>
					))}
				</div>
			</section>
		</div>
	);
}
