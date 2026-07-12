"use client";
/* eslint-disable react-doctor/no-react19-deprecated-apis, react-doctor/rendering-svg-precision */
/* eslint-disable */

import { forwardRef, useImperativeHandle } from "react";
import { domAnimation, LazyMotion, m, useAnimate } from "framer-motion";

import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { scaledStrokeWidth } from "./types";

const BookOpenIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
	({ size = 24, color = "currentColor", strokeWidth = 1.5, className = "" }, ref) => {
		const [scope, animate] = useAnimate();

		const start = async () => {
			await animate(".book-line", { pathLength: 0, opacity: 0 }, { duration: 0 });

			await animate(
				".book-line-1",
				{ pathLength: [0, 1], opacity: [0, 1] },
				{ duration: 0.3, ease: "easeInOut", delay: 0.1 },
			);

			await animate(
				".book-line-2",
				{ pathLength: [0, 1], opacity: [0, 1] },
				{ duration: 0.3, ease: "easeInOut", delay: 0.05 },
			);

			await animate(
				".book-line-3",
				{ pathLength: [0, 1], opacity: [0, 1] },
				{ duration: 0.3, ease: "easeInOut", delay: 0.05 },
			);
		};

		const stop = () => {
			animate(".book-line", { pathLength: 1, opacity: 1 }, { duration: 0.2 });
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
					viewBox="0 0 48 48"
					fill="none"
					stroke={color}
					strokeWidth={scaledStrokeWidth(strokeWidth, 48)}
					strokeMiterlimit="10"
					strokeLinecap="square"
					className={`cursor-pointer ${className}`}
				>
					<m.path className="book-spine" d="M24 40.5V41L24 10V10.5" />

					<m.path
						className="book-cover"
						style={{ transformOrigin: "24px 25px" }}
						d="M24 41C31.0005 36.9995 37.9995 36.9995 45 41V10.0003C37.9995 5.99989 31.0005 5.99989 24 10.0003C16.9995 5.99989 10.0005 5.99989 3 10.0003V41C10.0005 36.9995 16.9995 36.9995 24 41Z"
					/>

					<m.path
						className="book-line book-line-1"
						d="M30 16.5C32.8362 15.1345 36.5662 15.06 39.5 16.2763"
					/>

					<m.path
						className="book-line book-line-2"
						d="M30 23.5832C32.8362 22.2178 36.5662 22.1432 39.5 23.3596"
					/>

					<m.path
						className="book-line book-line-3"
						d="M30 30.6665C32.8362 29.301 36.5662 29.2265 39.5 30.4428"
					/>
				</m.svg>
			</LazyMotion>
		);
	},
);

BookOpenIcon.displayName = "BookOpenIcon";
export { BookOpenIcon };
