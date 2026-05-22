"use client";

import { useEffect, useState } from "react";
import { AnimatedNumber } from "@/shared/ui/animated-number";
import { DemoFrame } from "../demo-frame";

export function AnimatedNumberDemo() {
	const [value, setValue] = useState(12);

	useEffect(() => {
		const timer = window.setInterval(() => {
			setValue((current) => (current === 12 ? 18 : current === 18 ? 11 : 12));
		}, 1600);

		return () => window.clearInterval(timer);
	}, []);

	return (
		<DemoFrame
			title="Preview"
			status="Animated counts"
		>
			<div className="space-y-2 text-[11px] text-foreground/88">
				<div className="inline-flex items-baseline gap-1 rounded-sm border border-border/70 bg-background px-2.5 py-2 font-mono tabular-nums">
					<AnimatedNumber value={value} />
					<span className="text-muted-foreground">words</span>
				</div>
				<p className="max-w-[18rem] text-[10px] leading-4 text-muted-foreground">
					When enabled, the number updates animate instead of snapping to the new value.
				</p>
			</div>
		</DemoFrame>
	);
}
