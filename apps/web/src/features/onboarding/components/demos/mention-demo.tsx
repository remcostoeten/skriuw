"use client";

import { m, useReducedMotion } from "framer-motion";
import { AtSign, FilePlus2, Link2 } from "lucide-react";
import { Caret, DEMO_LOOP, DemoFrame, PopIn, TypingText } from "./shared";

const BACKLINKS = ["Weekly review", "Q3 planning", "Meeting notes — July"];

export function MentionDemo() {
	const reduceMotion = useReducedMotion();

	return (
		<DemoFrame>
			<div className="font-mono text-sm text-foreground/80">
				See also <TypingText text="@Roadmap" className="text-primary" />
				<Caret />
			</div>
			<div className="overflow-hidden rounded-md border border-border bg-popover p-1">
				<PopIn delay={1.0} className="block w-full">
					<span className="flex items-center gap-2 rounded bg-accent px-2 py-1.5 text-xs text-accent-foreground">
						<FilePlus2 className="size-3 text-muted-foreground" />
						<span className="font-medium">Create “Roadmap”</span>
						<span className="ml-auto text-[10px] text-muted-foreground">
							new note, linked
						</span>
					</span>
				</PopIn>
			</div>
			<PopIn delay={1.4}>
				<span className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
					<AtSign className="size-3" />
					Roadmap
				</span>
			</PopIn>
			<PopIn delay={1.9} className="block">
				<span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
					<Link2 className="size-3" />
					Backlinks · Roadmap
				</span>
			</PopIn>
			<div className="overflow-hidden rounded-md border border-border bg-popover p-1">
				{BACKLINKS.map((label, i) => (
					<m.div
						key={label}
						initial={reduceMotion ? false : { opacity: 0, x: -8 }}
						animate={{ opacity: 1, x: 0 }}
						transition={
							reduceMotion
								? undefined
								: { ...DEMO_LOOP, duration: 0.2, delay: 2.1 + 0.28 * i }
						}
						className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-popover-foreground"
					>
						<AtSign className="size-3 text-muted-foreground" />
						<span className="font-medium">{label}</span>
					</m.div>
				))}
			</div>
		</DemoFrame>
	);
}
