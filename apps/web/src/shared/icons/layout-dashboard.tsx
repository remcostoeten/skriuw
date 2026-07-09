"use client";

import { useImperativeHandle } from "react";
import { domAnimation, LazyMotion, m, useAnimate } from "framer-motion";

import type { AnimatedIconHandle, AnimatedIconProps } from "./types";

function LayoutDashboardIcon({
	size = 24,
	color = "currentColor",
	strokeWidth = 2,
	className = "",
	ref,
}: AnimatedIconProps & { ref?: React.Ref<AnimatedIconHandle> }) {
	const [scope, animate] = useAnimate();

	const start = async () => {
		animate(".rect-1", { x: 10 }, { duration: 0.3, ease: "easeInOut" });
		animate(".rect-2", { y: 12, x: -1 }, { duration: 0.3, ease: "easeInOut" });
		animate(".rect-3", { x: -10 }, { duration: 0.3, ease: "easeInOut" });
		animate(".rect-4", { y: -12, x: 1 }, { duration: 0.3, ease: "easeInOut" });
	};

	const stop = async () => {
		animate(
			".rect-1, .rect-2, .rect-3, .rect-4",
			{ x: 0, y: 0 },
			{ duration: 0.2, ease: "easeInOut" },
		);
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
				viewBox="0 0 24 24"
				fill="none"
				stroke={color}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
				className={`cursor-pointer ${className}`}
			>
				<m.rect className="rect-1" width="7" height="9" x="3" y="3" rx="1" />
				<m.rect className="rect-2" width="7" height="5" x="14" y="3" rx="1" />
				<m.rect className="rect-3" width="7" height="9" x="14" y="12" rx="1" />
				<m.rect className="rect-4" width="7" height="5" x="3" y="16" rx="1" />
			</m.svg>
		</LazyMotion>
	);
}

LayoutDashboardIcon.displayName = "LayoutDashboardIcon";
export { LayoutDashboardIcon };
