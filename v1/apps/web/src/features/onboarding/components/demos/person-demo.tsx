"use client";

import { Caret, DemoFrame, PopIn, TypingText } from "./shared";

export function PersonDemo() {
	return (
		<DemoFrame>
			<div className="font-mono text-sm text-foreground/80">
				Pairing with <TypingText text="$Remco" className="text-primary" />
				<Caret />
			</div>
			<div className="flex items-center gap-2 pt-1">
				<PopIn delay={0.95}>
					<span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 py-0.5 pl-0.5 pr-2 text-xs font-medium text-primary">
						<span className="flex size-4 items-center justify-center rounded-full bg-primary/20 text-[9px] font-semibold">
							R
						</span>
						Remco
					</span>
				</PopIn>
				<PopIn delay={1.25}>
					<span className="text-[10px] text-muted-foreground">
						→ profile + graph node
					</span>
				</PopIn>
			</div>
		</DemoFrame>
	);
}
