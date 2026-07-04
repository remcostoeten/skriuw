"use client";

import type { Variants } from "framer-motion";
import { LazyMotion, domMin, m, useAnimation, useReducedMotion } from "framer-motion";
import { forwardRef, useCallback, useImperativeHandle, useRef, type HTMLAttributes } from "react";

import { cn } from "@/shared/lib/utils";

export interface TagIconHandle {
	startAnimation: () => void;
	stopAnimation: () => void;
}

type TagIconProps = Omit<
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
};

const TagIcon = forwardRef<TagIconHandle, TagIconProps>(
	(
		{
			onMouseEnter,
			onMouseLeave,
			className,
			size = 24,
			duration = 1,
			isAnimated = true,
			color,
			...props
		},
		ref,
	) => {
		const controls = useAnimation();
		const reduced = useReducedMotion();
		const isControlled = useRef(false);

		useImperativeHandle(ref, () => {
			isControlled.current = true;
			return {
				startAnimation: () =>
					reduced ? controls.start("normal") : controls.start("animate"),
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
			normal: { rotate: 0 },
			animate: {
				rotate: [0, -9, 6, -4, 2, 0],
				transition: { duration: 1.3 * duration, ease: "easeInOut", repeat: 0 },
			},
		};

		const holeVariants: Variants = {
			normal: { scale: 1, opacity: 1 },
			animate: {
				scale: [1, 0.55, 1.25, 1],
				opacity: [1, 0.5, 1],
				transition: { duration: 0.7 * duration, ease: "easeInOut", repeat: 0 },
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
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						animate={controls}
						initial="normal"
						variants={svgVariants}
						style={{ transformOrigin: "6px 6px" }}
					>
						<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
						<m.circle
							cx="7.5"
							cy="7.5"
							r="0.5"
							fill="currentColor"
							variants={holeVariants}
							animate={controls}
							initial="normal"
							style={{ transformBox: "fill-box", transformOrigin: "center" }}
						/>
					</m.svg>
				</m.div>
			</LazyMotion>
		);
	},
);

TagIcon.displayName = "TagIcon";
export { TagIcon };
