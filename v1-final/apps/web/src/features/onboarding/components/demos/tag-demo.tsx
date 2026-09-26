"use client";

import { Hash } from "lucide-react";
import { Caret, DemoFrame, PopIn, TypingText } from "./shared";

export function TagDemo() {
	return (
		<DemoFrame>
			<div className="font-mono text-sm text-foreground/80">
				Brainstorm session <TypingText text="#ideas" className="text-primary" />
				<Caret />
			</div>
			<div className="flex flex-wrap items-center gap-1.5 pt-1">
				<PopIn delay={0.9}>
					<span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
						<Hash className="size-3" />
						ideas
					</span>
				</PopIn>
				<PopIn delay={1.15}>
					<span className="text-[10px] text-muted-foreground">
						→ rolls up into Tags &amp; the graph
					</span>
				</PopIn>
			</div>
		</DemoFrame>
	);
}
