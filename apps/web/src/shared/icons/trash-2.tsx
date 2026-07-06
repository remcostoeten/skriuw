"use client";

import type { Variants } from "framer-motion";
import { LazyMotion, domMin, m, useAnimation, useReducedMotion } from "framer-motion";
import { forwardRef, useCallback, useImperativeHandle, useRef, type HTMLAttributes } from "react";

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
};

const Trash2Icon = forwardRef<Trash2IconHandle, Trash2IconProps>(
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

		const lidVariants: Variants = {
			normal: { rotate: 0 },
			animate: {
				rotate: [0, -12, 0],
				transition: { duration: 0.45 * duration, ease: "easeInOut", repeat: 0 },
			},
		};

		const lineVariants: Variants = {
			normal: { y: 0 },
			animate: {
				y: [0, 1.5, 0],
				transition: {
					duration: 0.4 * duration,
					ease: "easeInOut",
					repeat: 0,
					delay: 0.15 * duration,
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
						<m.path
							d="M10 11v6"
							variants={lineVariants}
							animate={controls}
							initial="normal"
						/>
						<m.path
							d="M14 11v6"
							variants={lineVariants}
							animate={controls}
							initial="normal"
						/>
						<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
						<m.g
							variants={lidVariants}
							animate={controls}
							initial="normal"
							style={{ transformBox: "view-box", transformOrigin: "3px 6px" }}
						>
							<path d="M3 6h18" />
							<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
						</m.g>
					</svg>
				</m.div>
			</LazyMotion>
		);
	},
);

Trash2Icon.displayName = "Trash2Icon";
export { Trash2Icon };
