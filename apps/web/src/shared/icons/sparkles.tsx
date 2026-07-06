"use client";

import { forwardRef, useCallback, useImperativeHandle } from "react";
import { motion, useAnimate } from "framer-motion";

import type { AnimatedIconHandle, AnimatedIconProps } from "./types";

const SparklesIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
	({ size = 24, color = "currentColor", strokeWidth = 2, className = "" }, ref) => {
		const [scope, animate] = useAnimate();

		const start = useCallback(() => {
			animate(
				".sparkle-main",
				{ rotate: 180, scale: [1, 1.2, 1] },
				{ duration: 0.6, ease: "easeInOut" },
			);

			animate(
				".sparkle-top",
				{
					rotate: -90,
					scale: [1, 0.8, 1.1],
					opacity: [1, 0.6, 1],
				},
				{ duration: 0.5, ease: "easeInOut", delay: 0.1 },
			);

			animate(
				".sparkle-bottom",
				{
					rotate: 90,
					scale: [1, 1.15, 0.9],
					opacity: [1, 0.7, 1],
				},
				{ duration: 0.5, ease: "easeInOut", delay: 0.05 },
			);
		}, [animate]);

		const stop = useCallback(() => {
			animate(".sparkle-main", { rotate: 0, scale: 1 }, { duration: 0.25 });
			animate(".sparkle-top", { rotate: 0, scale: 1, opacity: 1 }, { duration: 0.25 });
			animate(".sparkle-bottom", { rotate: 0, scale: 1, opacity: 1 }, { duration: 0.25 });
		}, [animate]);

		useImperativeHandle(ref, () => ({
			startAnimation: start,
			stopAnimation: stop,
		}));

		return (
			<motion.svg
				ref={scope}
				onHoverStart={start}
				onHoverEnd={stop}
				xmlns="http://www.w3.org/2000/svg"
				width={size}
				height={size}
				viewBox="0 0 24 24"
				fill="none"
				stroke={color}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
				className={`cursor-pointer ${className}`}
				style={{ overflow: "visible" }}
			>
				<motion.path
					className="sparkle-bottom"
					d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2z"
					style={{ transformOrigin: "18px 18px" }}
				/>
				<motion.path
					className="sparkle-top"
					d="M16 6a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2z"
					style={{ transformOrigin: "18px 6px" }}
				/>
				<motion.path
					className="sparkle-main"
					d="M9 18a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z"
					style={{ transformOrigin: "9px 12px" }}
				/>
			</motion.svg>
		);
	},
);

SparklesIcon.displayName = "SparklesIcon";
export { SparklesIcon };
