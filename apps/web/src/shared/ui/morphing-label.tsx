"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

export type MorphingLabelFrame = {
	key: string;
	content: ReactNode;
};

type Props = {
	activeKey: string;
	frames: MorphingLabelFrame[];
	/** Applied to the ghost measuring span and every visible frame, so padding is baked into the measured width. */
	framePadding?: string;
};

/**
 * A button's inner content that crossfades and morphs its width when
 * `activeKey` changes, instead of instantly swapping. The ghost span mirrors
 * the active frame so width is measured in the exact typography context the
 * labels render in (webview font fallback, zoom, late font load can disagree
 * with an external measuring node); the ResizeObserver re-syncs when those
 * factors change after mount.
 */
export function MorphingLabel({ activeKey, frames, framePadding }: Props) {
	const [width, setWidth] = useState<number | null>(null);
	const ghost = useRef<HTMLSpanElement | null>(null);
	const activeIndex = Math.max(
		0,
		frames.findIndex((frame) => frame.key === activeKey),
	);
	const activeFrame = frames[activeIndex];

	useLayoutEffect(
		function sync() {
			const node = ghost.current;
			if (!node) return;
			setWidth(node.offsetWidth);
			const observer = new ResizeObserver(function measure() {
				setWidth(node.offsetWidth);
			});
			observer.observe(node);
			return function cleanup() {
				observer.disconnect();
			};
		},
		[activeIndex],
	);

	return (
		<span
			className="relative inline-flex h-full items-center justify-center overflow-hidden"
			style={{ width: width ?? undefined }}
		>
			<span
				aria-hidden
				ref={ghost}
				className={cn(
					"invisible pointer-events-none inline-flex items-center gap-2 whitespace-nowrap",
					framePadding,
				)}
			>
				{activeFrame?.content}
			</span>

			{frames.map((frame, index) => {
				const on = frame.key === activeKey;
				const above = index < activeIndex;
				return (
					<span
						key={frame.key}
						className={cn(
							"absolute inset-0 flex items-center justify-center gap-2 whitespace-nowrap",
							framePadding,
						)}
						style={{
							opacity: on ? 1 : 0,
							transform: on
								? "translateY(0)"
								: above
									? "translateY(-100%)"
									: "translateY(100%)",
							transition:
								"transform 0.35s cubic-bezier(0.32,0.72,0,1), opacity 0.25s ease",
						}}
					>
						{frame.content}
					</span>
				);
			})}
		</span>
	);
}
