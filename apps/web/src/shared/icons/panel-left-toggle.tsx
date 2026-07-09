"use client";

import { useImperativeHandle, useCallback } from "react";
import { domAnimation, LazyMotion, m, useAnimate } from "framer-motion";

import type { AnimatedIconHandle, AnimatedIconProps } from "./types";

function PanelLeftToggleIcon({
	size = 24,
	color = "currentColor",
	strokeWidth = 2,
	className = "",
	ref,
}: AnimatedIconProps & { ref?: React.Ref<AnimatedIconHandle> }) {
	const [scope, animate] = useAnimate();

	const start = useCallback(async () => {
		animate(".panel-divider", { x: -2, scaleX: 1.1 }, { duration: 0.3, ease: "easeInOut" });
		animate(".panel-container", { scale: 1.02 }, { duration: 0.3, ease: "easeOut" });
	}, [animate]);

	const stop = useCallback(async () => {
		animate(
			".panel-divider, .panel-container",
			{ x: 0, scaleX: 1, scale: 1 },
			{ duration: 0.25, ease: "easeInOut" },
		);
	}, [animate]);

	useImperativeHandle(ref, () => ({
		startAnimation: start,
		stopAnimation: stop,
	}));

	return (
		<LazyMotion features={domAnimation} strict>
			<m.svg
				ref={scope}
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
				onHoverStart={start}
				onHoverEnd={stop}
			>
				<path stroke="none" d="M0 0h24v24H0z" fill="none" />

				<m.path
					className="panel-container"
					d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"
				/>

				<m.path className="panel-divider" d="M9 4l0 16" />
			</m.svg>
		</LazyMotion>
	);
}

PanelLeftToggleIcon.displayName = "PanelLeftToggleIcon";
export { PanelLeftToggleIcon };
