"use client";

import { useImperativeHandle } from "react";
import { domAnimation, LazyMotion, m, useAnimate, type Variants } from "framer-motion";

import type { AnimatedIconHandle, AnimatedIconProps } from "./types";

const plusVariants: Variants = {
	normal: { rotate: 0 },
	animate: {
		rotate: 90,
		transition: { duration: 0.3, ease: "easeInOut" },
	},
};

function PlusIcon({
	size = 24,
	color = "currentColor",
	strokeWidth = 2,
	className = "",
	ref,
}: AnimatedIconProps & { ref?: React.Ref<AnimatedIconHandle> }) {
	const [scope, animate] = useAnimate();

	const start = async () => {
		animate(scope.current, { rotate: 90 }, { duration: 0.3, ease: "easeInOut" });
	};

	const stop = async () => {
		animate(scope.current, { rotate: 0 }, { duration: 0.2, ease: "easeInOut" });
	};

	useImperativeHandle(ref, () => ({
		startAnimation: start,
		stopAnimation: stop,
	}));

	return (
		<LazyMotion features={domAnimation} strict>
			<m.svg
				ref={scope}
				whileHover="animate"
				initial="normal"
				variants={plusVariants}
				xmlns="http://www.w3.org/2000/svg"
				width={size}
				height={size}
				viewBox="0 0 24 24"
				fill="none"
				stroke={color}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
				className={className}
				style={{ originX: "50%", originY: "50%" }}
			>
				<path d="M5 12h14" />
				<path d="M12 5v14" />
			</m.svg>
		</LazyMotion>
	);
}

PlusIcon.displayName = "PlusIcon";
export { PlusIcon };
