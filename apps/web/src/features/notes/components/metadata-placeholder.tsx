import type { ComponentType } from "react";
import { ChevronRight, Contact, FileText, Hash, Info, Link2, ListTree } from "lucide-react";
import { cn } from "@/shared/lib/utils";

const SHIMMER_STEP_MS = 70;

function MetadataPlaceholderBar({
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
			className={cn("animate-skeleton-shimmer bg-foreground/[0.06]", className)}
			style={{ animationDelay: `${delay}ms`, ...style }}
		/>
	);
}

function MetadataPlaceholderSection({
	icon: Icon,
	label,
	children,
}: {
	icon: ComponentType<{ className?: string; strokeWidth?: number }>;
	label: string;
	children: React.ReactNode;
}) {
	return (
		<section className="border-b border-border">
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
		</section>
	);
}

function MetadataPlaceholderRow({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex items-center gap-3 border-b border-border px-3 py-2.5">
			<span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/40">
				{label}
			</span>
			{children}
		</div>
	);
}

export function NotesMetadataPlaceholder({
	isMobile = false,
	className,
}: {
	isMobile?: boolean;
	className?: string;
}) {
	return (
		<aside
			aria-label="Loading note inspector"
			aria-busy="true"
			className={cn(
				isMobile
					? "h-full w-full rounded-[inherit] border-0 bg-transparent"
					: "w-72 shrink-0 border-l border-border bg-background xl:w-80",
				className,
			)}
		>
			<div aria-hidden="true">
				<MetadataPlaceholderSection icon={ListTree} label="Outline">
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
								<MetadataPlaceholderBar
									className="h-2.5"
									style={{ width: row.width }}
									delay={index * SHIMMER_STEP_MS}
								/>
							</div>
						))}
					</div>
				</MetadataPlaceholderSection>

				<MetadataPlaceholderRow label="Page Icon">
					<MetadataPlaceholderBar className="h-6 w-6 rounded-md bg-foreground/[0.055]" />
				</MetadataPlaceholderRow>

				<MetadataPlaceholderRow label="Page Cover">
					<MetadataPlaceholderBar
						className="h-6 w-6 rounded-md bg-foreground/[0.055]"
						delay={SHIMMER_STEP_MS}
					/>
				</MetadataPlaceholderRow>

				<MetadataPlaceholderSection icon={Hash} label="Tags">
					<div className="flex flex-wrap gap-2">
						{["32%", "24%", "38%"].map((width, index) => (
							<MetadataPlaceholderBar
								key={width}
								className="h-6 rounded-full bg-foreground/[0.055]"
								style={{ width }}
								delay={index * SHIMMER_STEP_MS}
							/>
						))}
					</div>
				</MetadataPlaceholderSection>

				<MetadataPlaceholderSection icon={Contact} label="People">
					<MetadataPlaceholderBar className="h-2.5 w-[64%] bg-foreground/[0.045]" />
				</MetadataPlaceholderSection>

				<MetadataPlaceholderSection icon={Link2} label="Links">
					<div className="space-y-2">
						{["86%", "68%", "74%"].map((width, index) => (
							<div key={width} className="flex h-7 items-center gap-2">
								<FileText
									className="h-3.5 w-3.5 shrink-0 text-muted-foreground/24"
									strokeWidth={1.5}
								/>
								<MetadataPlaceholderBar
									className="h-2.5"
									style={{ width }}
									delay={index * SHIMMER_STEP_MS}
								/>
							</div>
						))}
					</div>
				</MetadataPlaceholderSection>

				<MetadataPlaceholderSection icon={Info} label="Details">
					<div className="space-y-2.5">
						{[
							{ label: "28%", value: "18%" },
							{ label: "34%", value: "26%" },
							{ label: "22%", value: "38%" },
							{ label: "30%", value: "32%" },
						].map((row, index) => (
							<div
								key={`${row.label}-${row.value}`}
								className="flex items-center justify-between gap-4"
							>
								<MetadataPlaceholderBar
									className="h-2.5 bg-foreground/[0.045]"
									style={{ width: row.label }}
									delay={index * SHIMMER_STEP_MS}
								/>
								<MetadataPlaceholderBar
									className="h-2.5 bg-foreground/[0.07]"
									style={{ width: row.value }}
									delay={index * SHIMMER_STEP_MS}
								/>
							</div>
						))}
					</div>
				</MetadataPlaceholderSection>
			</div>
		</aside>
	);
}
