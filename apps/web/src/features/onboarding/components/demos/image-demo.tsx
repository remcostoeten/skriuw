"use client";

import { m, useReducedMotion } from "framer-motion";
import { ImageIcon } from "lucide-react";
import { DEMO_LOOP } from "./shared";

export function ImageDemo() {
	const reduceMotion = useReducedMotion();

	return (
		<div className="overflow-hidden rounded-lg border border-border bg-background text-left">
			<m.div
				initial={reduceMotion ? false : { opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={reduceMotion ? undefined : { ...DEMO_LOOP, duration: 0.5, delay: 0.3 }}
				className="h-10 w-full bg-gradient-to-r from-primary/50 via-primary/25 to-primary/45"
			/>
			<div className="space-y-2 p-3">
				<div className="h-2 w-2/5 rounded bg-foreground/15" />
				<div className="h-2 w-4/5 rounded bg-foreground/10" />
				<m.div
					initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={
						reduceMotion ? undefined : { ...DEMO_LOOP, duration: 0.35, delay: 1.0 }
					}
					className="flex h-16 items-center justify-center rounded-md border border-dashed border-primary/40 bg-primary/5 text-primary"
				>
					<ImageIcon className="size-5" />
				</m.div>
				<div className="h-2 w-3/5 rounded bg-foreground/10" />
			</div>
		</div>
	);
}
