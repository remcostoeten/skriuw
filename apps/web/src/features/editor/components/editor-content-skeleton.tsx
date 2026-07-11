import { ChevronRight, FileText, Hash, History, Info, Link2, ListTree } from "lucide-react";
import { cn } from "@/shared/lib/utils";

const SHIMMER_STEP_MS = 70;

function Bar({
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
			className={cn("animate-skeleton-shimmer bg-foreground/[0.06]", className)}
			style={{ animationDelay: `${delay}ms`, ...style }}
		/>
	);
}

export function EditorContentSkeleton() {
	// Geometry mirrors the BlockNote content box (.blocknote-wrapper px-6 py-3
	// with an inner `.bn-editor { max-width: 42rem; margin: 0 auto }`) so the
	// text doesn't shift horizontally or vertically when the editor resolves.
	// Bars are static (no shimmer) — motion draws the eye and makes the wait
	// feel longer; the root fades in after the appear-delay window.
	return (
		<div className="animate-skeleton-appear px-6 py-3" aria-hidden="true">
			<div className="mx-auto w-full max-w-[42rem] space-y-7">
				<div className="h-7 w-[58%] bg-foreground/[0.06]" />

				<div className="space-y-2.5">
					<div className="h-2.5 w-full bg-foreground/[0.045]" />
					<div className="h-2.5 w-[94%] bg-foreground/[0.045]" />
					<div className="h-2.5 w-[72%] bg-foreground/[0.045]" />
				</div>

				<div className="space-y-2.5">
					<div className="h-2.5 w-[88%] bg-foreground/[0.035]" />
					<div className="h-2.5 w-[54%] bg-foreground/[0.035]" />
				</div>
			</div>
		</div>
	);
}

const DETAILS_SECTIONS = [
	{ icon: ListTree, label: "Outline" },
	{ icon: Hash, label: "Tags" },
	{ icon: Link2, label: "Links" },
	{ icon: History, label: "History" },
	{ icon: Info, label: "Details" },
] as const;

function DetailsSectionShell({
	icon: Icon,
	label,
	children,
}: {
	icon: (typeof DETAILS_SECTIONS)[number]["icon"];
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="border-b border-border">
			<div className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2">
				<div className="flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/45">
					<Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
					<span className="truncate">{label}</span>
				</div>
				<ChevronRight
					className="h-3.5 w-3.5 shrink-0 rotate-90 text-muted-foreground/30"
					strokeWidth={1.5}
				/>
			</div>
			<div className="px-4 pb-4">{children}</div>
		</div>
	);
}

const DETAIL_ROWS = [
	{ label: "w-[28%]", value: "w-[18%]" },
	{ label: "w-[34%]", value: "w-[26%]" },
	{ label: "w-[22%]", value: "w-[38%]" },
	{ label: "w-[30%]", value: "w-[32%]" },
];

function DetailRowsSkeleton() {
	return (
		<div className="space-y-2.5">
			{DETAIL_ROWS.map((row, index) => (
				<div key={row.label} className="flex items-center justify-between gap-4">
					<Bar
						className={cn("h-2.5 bg-foreground/[0.045]", row.label)}
						delay={index * SHIMMER_STEP_MS}
					/>
					<Bar
						className={cn("h-2.5 bg-foreground/[0.07]", row.value)}
						delay={index * SHIMMER_STEP_MS}
					/>
				</div>
			))}
		</div>
	);
}

export function DetailsPanelSkeleton() {
	return (
		<div aria-hidden="true" className="animate-skeleton-appear flex h-full min-h-0 flex-col">
			<div className="min-h-0 flex-1 overflow-hidden">
				<DetailsSectionShell icon={ListTree} label="Outline">
					<div className="space-y-2.5">
						{[
							{ width: "72%", indent: 0 },
							{ width: "54%", indent: 12 },
							{ width: "64%", indent: 12 },
							{ width: "46%", indent: 24 },
						].map((row, index) => (
							<div
								key={`${row.width}-${row.indent}`}
								className="flex items-center gap-2"
							>
								<span
									className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/[0.08]"
									style={{ marginLeft: row.indent }}
								/>
								<Bar
									className="h-2.5 bg-foreground/[0.06]"
									style={{ width: row.width }}
									delay={index * SHIMMER_STEP_MS}
								/>
							</div>
						))}
					</div>
				</DetailsSectionShell>

				<DetailsSectionShell icon={Hash} label="Tags">
					<div className="flex flex-wrap gap-2">
						{["32%", "24%", "38%", "28%"].map((width, index) => (
							<Bar
								key={width}
								className="h-6 rounded-full bg-foreground/[0.055]"
								style={{ width }}
								delay={index * SHIMMER_STEP_MS}
							/>
						))}
					</div>
				</DetailsSectionShell>

				<DetailsSectionShell icon={Link2} label="Links">
					<div className="space-y-4">
						<div className="space-y-2">
							<Bar className="h-2 w-[34%] bg-foreground/[0.04]" />
							{["86%", "68%"].map((width, index) => (
								<div key={width} className="flex h-7 items-center gap-2">
									<FileText
										className="h-3.5 w-3.5 shrink-0 text-muted-foreground/24"
										strokeWidth={1.5}
									/>
									<Bar
										className="h-2.5 bg-foreground/[0.06]"
										style={{ width }}
										delay={index * SHIMMER_STEP_MS}
									/>
								</div>
							))}
						</div>
						<div className="space-y-2">
							<Bar className="h-2 w-[38%] bg-foreground/[0.04]" />
							<div className="flex h-7 items-center gap-2">
								<FileText
									className="h-3.5 w-3.5 shrink-0 text-muted-foreground/24"
									strokeWidth={1.5}
								/>
								<Bar
									className="h-2.5 w-[74%] bg-foreground/[0.06]"
									delay={2 * SHIMMER_STEP_MS}
								/>
							</div>
						</div>
					</div>
				</DetailsSectionShell>

				<DetailsSectionShell icon={History} label="History">
					<div className="relative space-y-3">
						<span className="absolute bottom-2 left-[5px] top-2 w-px bg-border" />
						{["76%", "58%", "70%", "46%"].map((width, index) => (
							<div key={width} className="relative flex gap-3">
								<span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border border-border bg-background" />
								<div className="min-w-0 flex-1 space-y-1.5">
									<Bar
										className="h-2.5 bg-foreground/[0.06]"
										style={{ width }}
										delay={index * SHIMMER_STEP_MS}
									/>
									<Bar
										className="h-2 bg-foreground/[0.04]"
										style={{ width: `${32 + index * 8}%` }}
										delay={index * SHIMMER_STEP_MS}
									/>
								</div>
							</div>
						))}
					</div>
				</DetailsSectionShell>
			</div>

			<div className="shrink-0 border-t border-border bg-background">
				<div className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2">
					<div className="flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/45">
						<Info className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
						<span className="truncate">Details</span>
					</div>
					<ChevronRight
						className="h-3.5 w-3.5 shrink-0 rotate-90 text-muted-foreground/30"
						strokeWidth={1.5}
					/>
				</div>
				<div className="px-4 pb-4">
					<DetailRowsSkeleton />
				</div>
			</div>
		</div>
	);
}
