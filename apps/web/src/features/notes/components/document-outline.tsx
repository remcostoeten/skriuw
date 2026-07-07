"use client";

import { cn } from "@/shared/lib/utils";
import type { TOutlineHeading } from "@/features/notes/hooks/use-document-outline";

type Props = {
	headings: TOutlineHeading[];
	onSelect: (heading: TOutlineHeading) => void;
};

function textToneClass(level: number): string {
	if (level <= 1) return "text-foreground/78";
	if (level === 2) return "text-foreground/62";
	if (level === 3) return "text-foreground/50";
	return "text-foreground/42";
}

function sizeClass(level: number): string {
	if (level <= 1) return "text-[12.5px] font-medium";
	if (level === 2) return "text-[12px]";
	if (level === 3) return "text-[11.5px]";
	return "text-[11px]";
}

export function DocumentOutline({ headings, onSelect }: Props) {
	if (headings.length === 0) {
		return <p className="text-[13px] leading-5 text-muted-foreground/62">No headings</p>;
	}

	const minLevel = Math.min(...headings.map((heading) => heading.level));

	return (
		<ul className="min-w-0 space-y-0.5">
			{headings.map((heading) => {
				const depth = Math.max(0, heading.level - minLevel);
				const indent = depth * 14;
				return (
					<li key={heading.key}>
						<button
							type="button"
							onClick={() => onSelect(heading)}
							style={{ paddingLeft: `${indent + 8}px` }}
							className={cn(
								"group flex min-h-7 w-full min-w-0 cursor-pointer items-center rounded-md border border-transparent pr-2 text-left transition-colors hover:border-border hover:bg-muted focus-visible:border-ring focus-visible:bg-muted focus-visible:outline-none",
								textToneClass(heading.level),
							)}
						>
							<span
								className={cn("min-w-0 flex-1 truncate", sizeClass(heading.level))}
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
