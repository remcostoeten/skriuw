import { format } from "date-fns";
import {
	CalendarDays,
	ChevronLeft,
	Code,
	Plus,
	Search,
	Settings2,
	Sidebar,
	SortDesc,
	Type,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";

export type JournalContentSkeletonView = "list" | "editor";

function Bar({ className }: { className?: string }) {
	return <div aria-hidden className={cn("bg-foreground/[0.06]", className)} />;
}

function StaticControl({ children, className }: { children: React.ReactNode; className?: string }) {
	return (
		<div
			aria-hidden
			className={cn(
				"inline-flex items-center justify-center text-muted-foreground/55",
				className,
			)}
		>
			{children}
		</div>
	);
}

function JournalMobileToolbarSkeleton({
	view,
	title,
}: {
	view: JournalContentSkeletonView;
	title: string;
}) {
	return (
		<div className="border-b border-border bg-card px-3 pb-3 pt-[max(env(safe-area-inset-top),0.85rem)] sm:px-4 md:hidden">
			<div className="flex items-center gap-2.5 sm:gap-3">
				<div className="flex h-11 items-center gap-1 border border-border bg-background px-1">
					<StaticControl className="h-11 w-11">
						<Sidebar className="h-[18px] w-[18px]" strokeWidth={1.7} />
					</StaticControl>
					<StaticControl className="h-11 w-11">
						<ChevronLeft className="h-[18px] w-[18px]" strokeWidth={1.7} />
					</StaticControl>
					<StaticControl className="h-11 w-11">
						<CalendarDays className="h-[18px] w-[18px]" strokeWidth={1.7} />
					</StaticControl>
				</div>

				<div className="flex h-11 min-w-0 flex-1 items-center border border-border bg-background px-4">
					<div className="min-w-0">
						<div className="truncate text-[10px] text-muted-foreground/70">Journal</div>
						<div className="truncate text-[15px] font-semibold tracking-[-0.02em] text-foreground/70">
							{title}
						</div>
					</div>
				</div>

				<div className="flex h-11 items-center gap-1.5 sm:gap-2">
					{view === "list" ? (
						<StaticControl className="h-11 w-11 shrink-0 border border-border bg-background">
							<Plus className="h-[18px] w-[18px]" strokeWidth={1.7} />
						</StaticControl>
					) : (
						<StaticControl className="h-11 w-11 shrink-0 border border-border bg-background">
							<Code className="h-[18px] w-[18px]" strokeWidth={1.7} />
						</StaticControl>
					)}
					<StaticControl className="h-11 w-11 shrink-0 border border-border bg-background">
						<Settings2 className="h-[18px] w-[18px]" strokeWidth={1.7} />
					</StaticControl>
				</div>
			</div>
		</div>
	);
}

function JournalDesktopToolbarSkeleton({
	view,
	title,
}: {
	view: JournalContentSkeletonView;
	title: string;
}) {
	const desktopIconButtonClass =
		"inline-flex h-7 w-7 items-center justify-center text-sidebar-foreground/58";

	return (
		<div className="hidden border-b border-sidebar-border border-l bg-sidebar text-sidebar-foreground md:block">
			<div className="flex h-11 items-center px-3">
				<div className="flex items-center gap-1">
					<StaticControl className={desktopIconButtonClass}>
						<Sidebar className="h-4 w-4" strokeWidth={1.5} />
					</StaticControl>
					{view === "editor" ? (
						<StaticControl className={desktopIconButtonClass}>
							<ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
						</StaticControl>
					) : null}
					<StaticControl className={desktopIconButtonClass}>
						<CalendarDays className="h-4 w-4" strokeWidth={1.5} />
					</StaticControl>
				</div>

				<div className="flex flex-1 items-center justify-center gap-3 text-sm">
					<span className="text-sidebar-foreground/58">Journal</span>
					<span className="max-w-[28rem] truncate font-medium text-sidebar-foreground/68">
						{title}
					</span>
				</div>

				<div className="flex items-center gap-1">
					{view === "list" ? (
						<>
							<StaticControl className={desktopIconButtonClass}>
								<Search className="h-4 w-4" strokeWidth={1.5} />
							</StaticControl>
							<StaticControl className="ml-1 h-7 gap-1.5 px-2.5 text-[11px] text-sidebar-foreground/58">
								<Plus className="h-3.5 w-3.5" strokeWidth={1.7} />
								<span>New</span>
							</StaticControl>
						</>
					) : (
						<>
							<StaticControl className="h-7 gap-1 px-2.5 text-[11px] text-sidebar-foreground/58">
								<Type className="h-3.5 w-3.5" strokeWidth={1.5} />
								<span>Rich Text</span>
							</StaticControl>
							<StaticControl className={desktopIconButtonClass}>
								<Settings2 className="h-4 w-4" strokeWidth={1.5} />
							</StaticControl>
						</>
					)}
				</div>
			</div>
		</div>
	);
}

function JournalListTabsSkeleton() {
	const tabs = ["All", "Daily", "Tagged", "Mood"];

	return (
		<div className="flex h-11 items-center gap-2 border-b border-border px-2 md:px-3">
			<div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
				{tabs.map((label) => (
					<span
						key={label}
						className={cn(
							"flex h-7 shrink-0 items-center px-3 text-[12px] font-medium md:text-[13px]",
							label === "All" ? "text-foreground/70" : "text-muted-foreground/50",
						)}
					>
						{label}
					</span>
				))}
				<StaticControl className="ml-auto h-9 w-9 md:hidden">
					<Search className="h-3.5 w-3.5" strokeWidth={1.5} />
				</StaticControl>
				<StaticControl className="h-9 w-9 md:hidden">
					<SortDesc className="h-3.5 w-3.5" strokeWidth={1.5} />
				</StaticControl>
			</div>
		</div>
	);
}

const LIST_ROW_TITLE_WIDTHS = [
	"w-[62%]",
	"w-[48%]",
	"w-[71%]",
	"w-[54%]",
	"w-[66%]",
	"w-[43%]",
	"w-[58%]",
	"w-[50%]",
	"w-[64%]",
	"w-[46%]",
];

function JournalListBodySkeleton() {
	return (
		<div className="flex-1 overflow-hidden px-3 md:px-0">
			<div className="mt-2 md:mt-0">
				{LIST_ROW_TITLE_WIDTHS.map((width, index) => (
					<div
						key={index}
						className="flex h-[54px] items-center gap-3 border-b border-border px-1 py-2.5 md:px-4"
					>
						<span className="w-5 shrink-0 text-center text-[14px] text-muted-foreground/20">
							·
						</span>
						<Bar className={cn("h-2.5 bg-foreground/[0.08]", width)} />
						<span className="ml-auto shrink-0 text-[12px] text-muted-foreground/35">
							May {27 - index}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

function JournalEditorBodySkeleton() {
	return (
		<div className="flex flex-1 flex-col overflow-y-auto">
			<div className="mx-auto w-full max-w-[720px] px-6 py-12 md:px-16 lg:py-20">
				<Bar className="h-8 w-[42%] bg-foreground/[0.085] lg:h-9" />
				<Bar className="mt-2 h-3.5 w-[58%] bg-foreground/[0.05]" />

				<div className="mt-6 flex items-center gap-2">
					<span className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/35">
						Mood
					</span>
					<div className="flex items-center gap-1">
						{Array.from({ length: 5 }).map((_, index) => (
							<div
								key={index}
								className="h-8 w-[4.5rem] border border-border/60 bg-muted/20"
							/>
						))}
					</div>
				</div>

				<div className="my-6 h-px bg-border/40" aria-hidden />

				<div className="min-h-[400px] space-y-2.5" aria-hidden>
					<Bar className="h-2.5 w-[88%]" />
					<Bar className="h-2.5 w-[94%]" />
					<Bar className="h-2.5 w-[72%]" />
					<div className="pt-4">
						<Bar className="h-2.5 w-[82%]" />
						<Bar className="mt-2.5 h-2.5 w-[65%]" />
					</div>
					<div className="pt-2">
						<Bar className="h-2.5 w-[76%] bg-foreground/[0.05]" />
						<Bar className="mt-2.5 h-2.5 w-[40%] bg-foreground/[0.05]" />
					</div>
				</div>

				<div className="mt-8 flex items-center border-t border-border pt-4">
					<Bar className="h-2.5 w-16 bg-foreground/[0.05]" />
				</div>
			</div>
		</div>
	);
}

type JournalContentSkeletonProps = {
	view?: JournalContentSkeletonView;
	title?: string;
};

export function JournalContentSkeleton({ view = "list", title }: JournalContentSkeletonProps) {
	const resolvedTitle =
		title ?? (view === "list" ? "Entries" : format(new Date(), "EEEE, dd MMMM yyyy"));

	return (
		<div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-card">
			<JournalMobileToolbarSkeleton view={view} title={resolvedTitle} />
			<JournalDesktopToolbarSkeleton view={view} title={resolvedTitle} />

			{view === "list" ? (
				<>
					<JournalListTabsSkeleton />
					<JournalListBodySkeleton />
				</>
			) : (
				<JournalEditorBodySkeleton />
			)}
		</div>
	);
}
