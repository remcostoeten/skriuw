"use client";

import type { Variants } from "framer-motion";
import { LazyMotion, domMin, m, useAnimation, useReducedMotion } from "framer-motion";
import { useCallback, useImperativeHandle, useRef, type HTMLAttributes, type Ref } from "react";

import { cn } from "@/shared/lib/utils";

export interface UserIconHandle {
	startAnimation: () => void;
	stopAnimation: () => void;
}

type UserIconProps = Omit<
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
	ref?: Ref<UserIconHandle>;
};

function UserIcon({
	onMouseEnter,
	onMouseLeave,
	className,
	size = 24,
	duration = 1,
	isAnimated = true,
	color,
	ref,
	...props
}: UserIconProps) {
	const controls = useAnimation();
	const reduced = useReducedMotion();
	const isControlled = useRef(false);

	useImperativeHandle(ref, () => {
		isControlled.current = true;
		return {
			startAnimation: () => (reduced ? controls.start("normal") : controls.start("animate")),
			stopAnimation: () => controls.start("normal"),
		};
	});

	const handleEnter = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (!isAnimated || reduced) return;
			if (!isControlled.current) controls.start("animate");
			else onMouseEnter?.(e);
		},
		[controls, reduced, isAnimated, onMouseEnter],
	);

	const handleLeave = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (!isControlled.current) controls.start("normal");
			else onMouseLeave?.(e);
		},
		[controls, onMouseLeave],
	);

	const svgVariants: Variants = {
		normal: { y: 0 },
		animate: {
			y: [0, -1, 0],
			transition: { duration: 0.5 * duration, ease: "easeInOut", repeat: 0 },
		},
	};

	const headVariants: Variants = {
		normal: { scale: 1 },
		animate: {
			scale: [1, 1.15, 1],
			transition: { duration: 0.5 * duration, ease: "easeInOut", repeat: 0 },
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
				<m.svg
					xmlns="http://www.w3.org/2000/svg"
					width={size}
					height={size}
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					animate={controls}
					initial="normal"
					variants={svgVariants}
				>
					<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
					<m.circle
						cx="12"
						cy="7"
						r="4"
						variants={headVariants}
						animate={controls}
						initial="normal"
						style={{ transformBox: "fill-box", transformOrigin: "center" }}
					/>
				</m.svg>
			</m.div>
		</LazyMotion>
	);
}

export { UserIcon };
