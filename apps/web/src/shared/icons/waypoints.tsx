"use client";

import type { Variants } from "framer-motion";
import { LazyMotion, domMin, m, useAnimation, useReducedMotion } from "framer-motion";
import { forwardRef, useCallback, useImperativeHandle, useRef, type HTMLAttributes } from "react";

import { cn } from "@/shared/lib/utils";

export interface WaypointsIconHandle {
	startAnimation: () => void;
	stopAnimation: () => void;
}

type WaypointsIconProps = Omit<
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

const NODES = [
	{ cx: 12, cy: 4 },
	{ cx: 20, cy: 12 },
	{ cx: 12, cy: 20 },
	{ cx: 4, cy: 12 },
];

const WaypointsIcon = forwardRef<WaypointsIconHandle, WaypointsIconProps>(
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

		const nodeVariants: Variants = {
			normal: { scale: 1, opacity: 1 },
			animate: (i: number) => ({
				scale: [1, 1.5, 1],
				opacity: [1, 0.6, 1],
				transition: {
					duration: 0.4 * duration,
					ease: "easeInOut",
					repeat: 0,
					delay: i * 0.12,
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
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width={size}
						height={size}
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="m10.586 5.414-5.172 5.172" />
						<path d="m18.586 13.414-5.172 5.172" />
						<path d="M6 12h12" />
						{NODES.map((n, i) => (
							<m.circle
								key={i}
								cx={n.cx}
								cy={n.cy}
								r="2"
								variants={nodeVariants}
								custom={i}
								animate={controls}
								initial="normal"
								style={{ transformBox: "fill-box", transformOrigin: "center" }}
							/>
						))}
					</svg>
				</m.div>
			</LazyMotion>
		);
	},
);

WaypointsIcon.displayName = "WaypointsIcon";
export { WaypointsIcon };
