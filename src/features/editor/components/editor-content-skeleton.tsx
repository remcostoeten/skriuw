import { ChevronRight, FileText, Hash, History, Info, Link2, ListTree } from "lucide-react";
import { cn } from "@/shared/lib/utils";

function Bar({ className }: { className?: string }) {
	return <div aria-hidden="true" className={cn("bg-foreground/[0.06]", className)} />;
}

export function EditorContentSkeleton() {
	return (
		<div className="mx-auto w-full max-w-[42rem] px-6 py-6" aria-hidden="true">
			<div className="space-y-7">
				<Bar className="h-7 w-[58%] bg-foreground/[0.085]" />

				<div className="space-y-2.5">
					<Bar className="h-2.5 w-full" />
					<Bar className="h-2.5 w-[94%]" />
					<Bar className="h-2.5 w-[72%]" />
				</div>

				<div className="space-y-2.5 pt-2">
					<Bar className="h-5 w-[36%] bg-foreground/[0.075]" />
					<div className="space-y-2.5 pt-1">
						<Bar className="h-2.5 w-[88%]" />
						<Bar className="h-2.5 w-[92%]" />
						<Bar className="h-2.5 w-[54%]" />
					</div>
				</div>

				<div className="space-y-2.5">
					<Bar className="h-2.5 w-[78%] bg-foreground/[0.055]" />
					<Bar className="h-2.5 w-[40%] bg-foreground/[0.055]" />
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

export function DetailsPanelSkeleton() {
	return (
		<div aria-hidden="true" className="flex flex-col">
			<div className="border-b border-border px-4 py-4">
				<div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/60">
					<FileText className="h-3.5 w-3.5" strokeWidth={1.5} />
					Details
				</div>
			</div>
			{DETAILS_SECTIONS.map(({ icon: Icon, label }) => (
				<div
					key={label}
					className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-2.5"
				>
					<div className="flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/45">
						<Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
						<span className="truncate">{label}</span>
					</div>
					<ChevronRight
						className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30"
						strokeWidth={1.5}
					/>
				</div>
			))}
		</div>
	);
}
