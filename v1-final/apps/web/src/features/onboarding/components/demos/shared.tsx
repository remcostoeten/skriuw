"use client";

import { m, useReducedMotion } from "framer-motion";
import { cn } from "@/shared/lib/utils";
import type { ReactNode } from "react";

const LOOP = { repeat: Infinity, repeatDelay: 2.2, repeatType: "loop" as const };

export function DemoFrame({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div
			className={cn(
				"space-y-2 rounded-lg border border-border bg-background p-3 text-left",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function Caret() {
	return (
		<span className="ml-px inline-block h-4 w-px translate-y-0.5 animate-pulse bg-primary" />
	);
}

type TypingTextProps = {
	text: string;
	className?: string;
	startDelay?: number;
	charDelay?: number;
};

/**
 * Character-by-character reveal that loops forever. Falls back to a static
 * fully-typed line under reduced motion.
 */
export function TypingText({
	text,
	className,
	startDelay = 0.3,
	charDelay = 0.07,
}: TypingTextProps) {
	const reduceMotion = useReducedMotion();
	const chars = Array.from(text);

	if (reduceMotion) {
		return <span className={className}>{text}</span>;
	}

	return (
		<span className={className} aria-label={text}>
			{chars.map((char, i) => (
				<m.span
					key={`${char}-${i}`}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{
						...LOOP,
						duration: 0.01,
						delay: startDelay + i * charDelay,
					}}
					aria-hidden
				>
					{char}
				</m.span>
			))}
		</span>
	);
}

/**
 * Reveals its child after `delay` seconds with a small spring pop, looping in
 * sync with `TypingText` (same repeat cadence). Static under reduced motion.
 */
export function PopIn({
	children,
	delay,
	className,
}: {
	children: ReactNode;
	delay: number;
	className?: string;
}) {
	const reduceMotion = useReducedMotion();

	if (reduceMotion) {
		return <span className={className}>{children}</span>;
	}

	return (
		<m.span
			initial={{ opacity: 0, scale: 0.85, y: 3 }}
			animate={{ opacity: 1, scale: 1, y: 0 }}
			transition={{ ...LOOP, type: "spring", stiffness: 340, damping: 22, delay }}
			className={cn("inline-block", className)}
		>
			{children}
		</m.span>
	);
}

export const DEMO_LOOP = LOOP;
