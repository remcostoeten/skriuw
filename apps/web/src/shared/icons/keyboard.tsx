"use client";
/* eslint-disable react-doctor/no-react19-deprecated-apis */

import type { Variants } from "framer-motion";
import { LazyMotion, domMin, m, useAnimation, useReducedMotion } from "framer-motion";
import { forwardRef, useCallback, useImperativeHandle, useRef, type HTMLAttributes } from "react";

import { cn } from "@/shared/lib/utils";

export interface KeyboardIconHandle {
	startAnimation: () => void;
	stopAnimation: () => void;
}

type KeyboardIconProps = Omit<
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

const KEYS = [
	{ cx: 6, cy: 8 },
	{ cx: 10, cy: 8 },
	{ cx: 14, cy: 8 },
	{ cx: 18, cy: 8 },
	{ cx: 8, cy: 12 },
	{ cx: 12, cy: 12 },
	{ cx: 16, cy: 12 },
];

const KeyboardIcon = forwardRef<KeyboardIconHandle, KeyboardIconProps>(
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
			normal: { y: 0 },
			animate: {
				y: [0, 0.6, 0],
				transition: { duration: 1.2 * duration, ease: "easeInOut", repeat: 0 },
			},
		};

		const keyVariants: Variants = {
			normal: { scale: 1, opacity: 1 },
			animate: (i: number) => ({
				scale: [1, 0.4, 1],
				opacity: [1, 0.5, 1],
				transition: {
					duration: 0.4 * duration,
					ease: "easeInOut",
					repeat: 0,
					delay: i * 0.09,
				},
			}),
		};

		const barVariants: Variants = {
			normal: { scaleY: 1 },
			animate: {
				scaleY: [1, 0.5, 1],
				transition: {
					duration: 0.4 * duration,
					ease: "easeInOut",
					repeat: 0,
					delay: KEYS.length * 0.09,
				},
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
						<rect width="20" height="16" x="2" y="4" rx="2" />
						{KEYS.map((k, i) => (
							<m.path
								key={`${k.cx}-${k.cy}`}
								d={`M${k.cx} ${k.cy}h.01`}
								variants={keyVariants}
								custom={i}
								animate={controls}
								initial="normal"
								style={{ transformBox: "fill-box", transformOrigin: "center" }}
							/>
						))}
						<m.path
							d="M7 16h10"
							variants={barVariants}
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

KeyboardIcon.displayName = "KeyboardIcon";
export { KeyboardIcon };
