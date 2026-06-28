"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";

export type AiWritingAction = "continueWriting" | "spellCheck" | "generateTitle";

const LABELS: Record<AiWritingAction, string> = {
	continueWriting: "Continuing your writing",
	spellCheck: "Checking spelling & grammar",
	generateTitle: "Generating a title",
};

type Props = {
	action: AiWritingAction | null;
};

const SHIMMER =
	"linear-gradient(110deg, hsl(var(--muted-foreground)) 30%, hsl(var(--foreground)) 50%, hsl(var(--muted-foreground)) 70%)";

function ShimmerLabel({ children, reduce }: { children: React.ReactNode; reduce: boolean }) {
	if (reduce) {
		return <span className="font-medium text-muted-foreground">{children}</span>;
	}
	return (
		<motion.span
			className="bg-clip-text font-medium text-transparent"
			style={{ backgroundImage: SHIMMER, backgroundSize: "220% 100%" }}
			animate={{ backgroundPositionX: ["160%", "-60%"] }}
			transition={{ duration: 1.7, repeat: Infinity, ease: "linear" }}
		>
			{children}
		</motion.span>
	);
}

function WritingDots({ reduce }: { reduce: boolean }) {
	return (
		<span className="flex items-center gap-[3px]">
			{[0, 1, 2].map((i) => (
				<motion.span
					key={i}
					className="block h-[3px] w-[3px] rounded-full bg-muted-foreground/55"
					animate={reduce ? { opacity: 0.5 } : { opacity: [0.2, 0.9, 0.2] }}
					transition={{
						duration: 1.1,
						repeat: Infinity,
						delay: i * 0.18,
						ease: "easeInOut",
					}}
				/>
			))}
		</span>
	);
}

export function AiWritingIndicator({ action }: Props) {
	const prefersReducedMotion = useReducedMotion();
	const reduce = Boolean(prefersReducedMotion);

	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center pb-5">
			<AnimatePresence>
				{action && (
					<motion.div
						key={action}
						initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.96 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
						transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
						className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-border/70 bg-card/95 py-1.5 pl-2.5 pr-4 text-xs shadow-lg shadow-black/5 backdrop-blur"
					>
						<span className="relative flex h-5 w-5 items-center justify-center">
							{!reduce && (
								<motion.span
									aria-hidden="true"
									className="absolute inset-0 rounded-full bg-foreground/10"
									animate={{ scale: [1, 1.6], opacity: [0.5, 0] }}
									transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
								/>
							)}
							<Sparkles
								className="relative h-3.5 w-3.5 text-foreground/70"
								strokeWidth={1.5}
							/>
						</span>
						<ShimmerLabel reduce={reduce}>{LABELS[action]}</ShimmerLabel>
						<WritingDots reduce={reduce} />
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
