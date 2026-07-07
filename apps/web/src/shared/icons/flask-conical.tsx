"use client";
/* eslint-disable react-doctor/no-react19-deprecated-apis */

import type { Variants } from "framer-motion";
import { LazyMotion, domMin, m, useAnimation, useReducedMotion } from "framer-motion";
import { forwardRef, useCallback, useImperativeHandle, useRef, type HTMLAttributes } from "react";

import { cn } from "@/shared/lib/utils";

export interface FlaskConicalIconHandle {
	startAnimation: () => void;
	stopAnimation: () => void;
}

type FlaskConicalIconProps = Omit<
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

const BUBBLES = [
	{ cx: 10, cy: 19, r: 0.9 },
	{ cx: 13, cy: 20, r: 0.7 },
	{ cx: 11.5, cy: 18, r: 0.6 },
];

const FlaskConicalIcon = forwardRef<FlaskConicalIconHandle, FlaskConicalIconProps>(
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
				rotate: [0, -3, 3, -2, 2, 0],
				transition: { duration: 1.4 * duration, ease: "easeInOut", repeat: 0 },
			},
		};

		const bubbleVariants: Variants = {
			normal: { y: 0, opacity: 0, scale: 0.6 },
			animate: (i: number) => ({
				y: [0, -3.5, -6],
				opacity: [0, 1, 0],
				scale: [0.6, 1, 0.7],
				transition: {
					duration: 1.1 * duration,
					ease: "easeOut",
					repeat: 0,
					delay: i * 0.22,
				},
			}),
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
						style={{ transformOrigin: "12px 22px" }}
					>
						<path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2" />
						<path d="M6.453 15h11.094" />
						<path d="M8.5 2h7" />
						{BUBBLES.map((b, i) => (
							<m.circle
								key={`${b.cx}-${b.cy}-${b.r}`}
								cx={b.cx}
								cy={b.cy}
								r={b.r}
								fill="currentColor"
								stroke="none"
								variants={bubbleVariants}
								custom={i}
								animate={controls}
								initial="normal"
							/>
						))}
					</m.svg>
				</m.div>
			</LazyMotion>
		);
	},
);

FlaskConicalIcon.displayName = "FlaskConicalIcon";
export { FlaskConicalIcon };
