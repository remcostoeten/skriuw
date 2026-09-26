"use client";

import { m, useReducedMotion } from "framer-motion";
import { Braces, ChevronRight, Sparkles, Waypoints } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Caret, DEMO_LOOP, DemoFrame, TypingText } from "./shared";
import type { LucideIcon } from "lucide-react";

const ROWS: Array<{ label: string; hint: string; icon: LucideIcon }> = [
	{ label: "Code block", hint: "Syntax-highlighted snippets", icon: Braces },
	{ label: "Diagram", hint: "Mermaid, rendered live", icon: Waypoints },
	{ label: "Toggle", hint: "Collapsible section", icon: ChevronRight },
	{ label: "Ask AI…", hint: "Write with a model", icon: Sparkles },
];

export function SlashDemo() {
	const reduceMotion = useReducedMotion();

	return (
		<DemoFrame>
			<div className="font-mono text-sm text-foreground/80">
				<TypingText text="/" startDelay={0.2} />
				<Caret />
			</div>
			<div className="overflow-hidden rounded-md border border-border bg-popover p-1">
				{ROWS.map((row, i) => {
					const RowIcon = row.icon;
					return (
						<m.div
							key={row.label}
							initial={reduceMotion ? false : { opacity: 0, y: 6 }}
							animate={{ opacity: 1, y: 0 }}
							transition={
								reduceMotion
									? undefined
									: { ...DEMO_LOOP, duration: 0.18, delay: 0.5 + 0.09 * i }
							}
							className={cn(
								"flex items-center gap-2 rounded px-2 py-1.5 text-xs",
								i === 0
									? "bg-accent text-accent-foreground"
									: "text-popover-foreground",
							)}
						>
							<RowIcon className="size-3 text-muted-foreground" />
							<span className="font-medium">{row.label}</span>
							<span className="ml-auto text-[10px] text-muted-foreground">
								{row.hint}
							</span>
						</m.div>
					);
				})}
			</div>
		</DemoFrame>
	);
}
