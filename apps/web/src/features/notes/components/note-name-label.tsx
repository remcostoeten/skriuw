"use client";

import { useState } from "react";
import { AnimatePresence, domAnimation, LazyMotion, m, useReducedMotion } from "framer-motion";

type TProps = {
	name: string;
	className?: string;
};

// Strong ease-out (Emil's UI curve). Exit is a touch faster than enter so the
// old name clears out before the new one settles — asymmetric timing reads as
// snappy rather than sluggish. Blur bridges the two strings so the swap feels
// like one motion instead of a hard cut.
const EASE = [0.23, 1, 0.32, 1] as const;

/**
 * Renders a note's name and crossfades old→new whenever it changes — e.g. when
 * the filename tracks an edited first heading. The optimistic cache update makes
 * the new name available immediately, so this animation is what the user sees as
 * the rename. No animation on first mount (`initial={false}`); `mode="wait"`
 * keeps a single line so the truncating sidebar row never reflows.
 */
export function NoteNameLabel({ name, className }: TProps) {
	const [isAnimating, setIsAnimating] = useState(false);
	const reduceMotion = useReducedMotion();

	return (
		<LazyMotion features={domAnimation} strict>
			<AnimatePresence initial={false} mode="wait">
				<m.span
					key={name}
					className={className}
					style={{ willChange: isAnimating ? "opacity, transform, filter" : undefined }}
					onAnimationStart={() => setIsAnimating(true)}
					onAnimationEnd={() => setIsAnimating(false)}
					initial={
						reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(4px)" }
					}
					animate={
						reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }
					}
					exit={
						reduceMotion
							? { opacity: 0, transition: { duration: 0.1, ease: EASE } }
							: {
									opacity: 0,
									y: -4,
									filter: "blur(4px)",
									transition: { duration: 0.13, ease: EASE },
								}
					}
					transition={{
						duration: reduceMotion ? 0.12 : 0.18,
						ease: EASE,
					}}
				>
					{name}
				</m.span>
			</AnimatePresence>
		</LazyMotion>
	);
}
