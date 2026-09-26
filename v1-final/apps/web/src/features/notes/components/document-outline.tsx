"use client";

import { cn } from "@/shared/lib/utils";
import type { TOutlineHeading } from "@/features/notes/hooks/use-document-outline";

type Props = {
	headings: TOutlineHeading[];
	activeKey?: string | null;
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

export function DocumentOutline({ headings, activeKey, onSelect }: Props) {
	if (headings.length === 0) {
		return <p className="text-[13px] leading-5 text-muted-foreground/62">No headings</p>;
	}

	const minLevel = Math.min(...headings.map((heading) => heading.level));
	const activeIndex = activeKey ? headings.findIndex((heading) => heading.key === activeKey) : -1;

	return (
		<ul className="min-w-0 space-y-0.5">
			{headings.map((heading, index) => {
				const depth = Math.max(0, heading.level - minLevel);
				const indent = depth * 14;
				const isActive = heading.key === activeKey;
				const isPassed = activeIndex >= 0 && index < activeIndex;
				return (
					<li key={heading.key}>
						<button
							type="button"
							onClick={() => onSelect(heading)}
							aria-current={isActive ? "true" : undefined}
							style={{ paddingLeft: `${indent + 12}px` }}
							className={cn(
								"group relative flex min-h-7 w-full min-w-0 cursor-pointer items-center rounded-md border border-transparent pr-2 text-left transition-colors duration-300 hover:border-border hover:bg-muted focus-visible:border-ring focus-visible:bg-muted focus-visible:outline-none",
								isActive ? "text-foreground" : textToneClass(heading.level),
							)}
						>
							<span
								aria-hidden
								className={cn(
									"absolute left-1 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-foreground/15 transition-all duration-300 ease-out",
									isActive
										? "scale-y-100 bg-foreground/70 opacity-100"
										: isPassed
											? "scale-y-100 opacity-100"
											: "scale-y-0 opacity-0",
								)}
							/>
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
