"use client";

import { cn } from "@/shared/lib/utils";
import type { TOutlineHeading } from "@/features/notes/hooks/use-document-outline";

type Props = {
	headings: TOutlineHeading[];
	onSelect: (heading: TOutlineHeading) => void;
};

function textToneClass(level: number): string {
	if (level <= 1) return "text-foreground/72";
	if (level === 2) return "text-foreground/58";
	if (level === 3) return "text-foreground/48";
	return "text-foreground/40";
}

function sizeClass(level: number): string {
	if (level <= 1) return "text-[12.5px] font-medium";
	if (level === 2) return "text-[12px]";
	if (level === 3) return "text-[11.5px]";
	return "text-[11px]";
}

export function DocumentOutline({ headings, onSelect }: Props) {
	if (headings.length === 0) {
		return (
			<div className="border border-dashed border-border/60 bg-muted/[0.12] px-3 py-2">
				<p className="text-[13px] leading-5 text-muted-foreground/62">No headings</p>
			</div>
		);
	}

	const minLevel = Math.min(...headings.map((heading) => heading.level));

	return (
		<ul className="min-w-0 overflow-hidden border border-border/65 bg-muted/[0.18] shadow-[inset_0_1px_0_hsl(var(--foreground)_/_0.025)]">
			{headings.map((heading) => {
				const depth = Math.max(0, heading.level - minLevel);
				const indent = depth * 10;
				return (
					<li
						key={heading.key}
						className="border-b border-border/45 last:border-b-0"
					>
						<button
							type="button"
							onClick={() => onSelect(heading)}
							className={cn(
								"group flex min-h-8 w-full min-w-0 cursor-pointer items-center gap-0 text-left transition-colors hover:bg-background/55 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
								textToneClass(heading.level),
							)}
							style={{ paddingLeft: `${indent + 8}px` }}
							title={heading.text}
						>
							{depth > 0 && (
								<span
									className={cn(
										"mr-2 my-1.5 shrink-0 self-stretch border-l",
										depth === 1
											? "border-muted-foreground/20"
											: "border-muted-foreground/12",
									)}
								/>
							)}
							<span
								className={cn(
									"min-w-0 flex-1 truncate py-1.5 pr-2",
									sizeClass(heading.level),
								)}
							>
								{heading.text}
							</span>
						</button>
					</li>
				);
			})}
		</ul>
	);
}
