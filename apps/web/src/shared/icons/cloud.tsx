"use client";

import { forwardRef, useCallback, useImperativeHandle } from "react";
import { domAnimation, LazyMotion, m, stagger, useAnimate } from "framer-motion";

import type { AnimatedIconHandle, AnimatedIconProps } from "./types";

const CloudIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
	({ size = 24, color = "currentColor", strokeWidth = 2, className = "" }, ref) => {
		const [scope, animate] = useAnimate();

		const start = useCallback(() => {
			animate(
				".status-dot",
				{ opacity: [1, 0.4, 1] },
				{
					duration: 1,
					repeat: Infinity,
					ease: "easeInOut",
					delay: stagger(0.3),
				},
			);
			animate(
				"path.cloud-path",
				{ scale: [1, 1.01, 1] },
				{ duration: 2, repeat: Infinity, ease: "easeInOut" },
			);
		}, [animate]);

		const stop = useCallback(() => {
			animate(".status-dot", { opacity: 1 }, { duration: 0.3 });
			animate("path.cloud-path", { scale: 1 }, { duration: 0.3 });
		}, [animate]);

		useImperativeHandle(ref, () => ({
			startAnimation: start,
			stopAnimation: stop,
		}));

		return (
			<LazyMotion features={domAnimation} strict>
				<m.svg
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
					<m.path
						className="cloud-path"
						d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"
						style={{ transformOrigin: "center" }}
					/>
					<m.circle className="status-dot" cx="9" cy="15" r="0.5" fill={color} />
					<m.circle className="status-dot" cx="12" cy="15" r="0.5" fill={color} />
					<m.circle className="status-dot" cx="15" cy="15" r="0.5" fill={color} />
				</m.svg>
			</LazyMotion>
		);
	},
);

CloudIcon.displayName = "CloudIcon";
export { CloudIcon };
