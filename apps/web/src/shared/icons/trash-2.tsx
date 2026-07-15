"use client";

import type { Variants } from "framer-motion";
import { LazyMotion, domMin, m, useAnimation, useReducedMotion } from "framer-motion";
import { useCallback, useImperativeHandle, useRef, type HTMLAttributes } from "react";

import { cn } from "@/shared/lib/utils";

export interface Trash2IconHandle {
	startAnimation: () => void;
	stopAnimation: () => void;
}

type Trash2IconProps = Omit<
	HTMLAttributes<HTMLDivElement>,
	| "color"
	| "onDrag"
	| "onDragStart"
	| "onDragEnd"
	| "onAnimationStart"
	| "onAnimationEnd"
	| "onAnimationIteration"
> & {
	size?: number;
	duration?: number;
	isAnimated?: boolean;
	color?: string;
	ref?: React.Ref<Trash2IconHandle>;
};

function Trash2Icon({
	onMouseEnter,
	onMouseLeave,
	className,
	size = 24,
	duration = 1,
	isAnimated = true,
	color,
	ref,
	...props
}: Trash2IconProps) {
	const binControls = useAnimation();
	const lidControls = useAnimation();
	const barControls = useAnimation();
	const reduced = useReducedMotion();
	const isControlled = useRef(false);

	useImperativeHandle(ref, () => {
		isControlled.current = true;
		return {
			startAnimation: () => {
				if (reduced) {
					binControls.start("normal");
					lidControls.start("normal");
					barControls.start("normal");
				} else {
					binControls.start("animate");
					lidControls.start("animate");
					barControls.start("animate");
				}
			},
			stopAnimation: () => {
				binControls.start("normal");
				lidControls.start("normal");
				barControls.start("normal");
			},
		};
	});

	const handleEnter = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (!isAnimated || reduced) return;
			binControls.start("animate");
			lidControls.start("animate");
			barControls.start("animate");
			onMouseEnter?.(e);
		},
		[binControls, lidControls, barControls, reduced, isAnimated, onMouseEnter],
	);

	const handleLeave = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			binControls.start("normal");
			lidControls.start("normal");
			barControls.start("normal");
			onMouseLeave?.(e);
		},
		[binControls, lidControls, barControls, onMouseLeave],
	);

	const binVariants: Variants = {
		normal: { scale: 1, rotate: 0, y: 0 },
		animate: {
			scale: [1, 1.05, 0.97, 1],
			rotate: [0, -2, 2, 0],
			y: [0, -1.5, 0],
			transition: { duration: 0.8 * duration, ease: "easeInOut" },
		},
	};

	const lidVariants: Variants = {
		normal: { rotate: 0, y: 0 },
		animate: {
			rotate: [-15, 5, 0],
			y: [-2, 0],
			transition: { duration: 0.7 * duration, ease: "easeOut", delay: 0.1 },
		},
	};

	const barVariants: Variants = {
		normal: { scaleY: 1, opacity: 1 },
		animate: {
			scaleY: [1, 1.2, 1],
			opacity: [1, 0.9, 1],
			transition: { duration: 0.6 * duration, ease: "easeInOut", delay: 0.2 },
		},
	};

	return (
		<LazyMotion features={domMin} strict>
			<m.div
				className={cn("inline-flex items-center justify-center", className)}
				onMouseEnter={handleEnter}
				onMouseLeave={handleLeave}
				{...props}
				style={{ color, ...props.style }}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width={size}
					height={size}
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<m.path
						d="M10 11v6"
						animate={barControls}
						initial="normal"
						variants={barVariants}
						style={{ transformBox: "fill-box", transformOrigin: "center bottom" }}
					/>
					<m.path
						d="M14 11v6"
						animate={barControls}
						initial="normal"
						variants={barVariants}
						style={{ transformBox: "fill-box", transformOrigin: "center bottom" }}
					/>
					<m.path
						d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
						animate={binControls}
						initial="normal"
						variants={binVariants}
					/>
					<path d="M3 6h18" />
					<m.path
						d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
						animate={lidControls}
						initial="normal"
						variants={lidVariants}
						style={{ transformBox: "fill-box", transformOrigin: "left bottom" }}
					/>
				</svg>
			</m.div>
		</LazyMotion>
	);
}

Trash2Icon.displayName = "Trash2Icon";
export { Trash2Icon };
