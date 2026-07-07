"use client";

import { forwardRef, useImperativeHandle } from "react";
import { domAnimation, LazyMotion, m, stagger, useAnimate } from "framer-motion";

import type { AnimatedIconHandle, AnimatedIconProps } from "./types";

const HashIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
	({ size = 24, color = "currentColor", strokeWidth = 7, className = "" }, ref) => {
		const [scope, animate] = useAnimate();

		const start = async () => {
			await animate(".hash-line", { pathLength: 0, opacity: 0.15 }, { duration: 0 });
			animate(
				".hash-line",
				{ pathLength: [0, 1], opacity: [0.15, 1] },
				{ duration: 0.4, ease: "easeInOut", delay: stagger(0.08) },
			);
		};

		const stop = () => {
			animate(".hash-line", { pathLength: 1, opacity: 1 }, { duration: 0.2 });
		};

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
					viewBox="0 0 100 100"
					fill="none"
					stroke={color}
					strokeWidth={strokeWidth}
					strokeLinecap="round"
					className={className}
					role="img"
					aria-label="Hash"
				>
					<m.line className="hash-line" x1="38" y1="15" x2="30" y2="85" />
					<m.line className="hash-line" x1="70" y1="15" x2="62" y2="85" />
					<m.line className="hash-line" x1="18" y1="40" x2="85" y2="36" />
					<m.line className="hash-line" x1="15" y1="66" x2="82" y2="62" />
				</m.svg>
			</LazyMotion>
		);
	},
);

HashIcon.displayName = "HashIcon";
export { HashIcon };
