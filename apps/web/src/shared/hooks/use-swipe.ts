"use client";

import { useCallback, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";

type SwipeDirection = "left" | "right" | "up" | "down";

type SwipeHandlers = {
	onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
	onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
	onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
	onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
};

type Props = {
	onSwipeLeft?: () => void;
	onSwipeRight?: () => void;
	onSwipeUp?: () => void;
	onSwipeDown?: () => void;
	/** Minimum primary-axis travel (px) to count as a swipe. */
	threshold?: number;
	/** Maximum perpendicular-axis travel (px) allowed for the swipe to register. */
	restraint?: number;
	/** Maximum gesture duration (ms); slower drags are treated as scrolls, not swipes. */
	maxDurationMs?: number;
	/** When set, the gesture must start within `edgeSize` px of this viewport edge. */
	edge?: "left" | "right";
	edgeSize?: number;
	/** Only react to these pointer types. Defaults to touch-only. */
	pointerTypes?: string[];
	enabled?: boolean;
	haptic?: Parameters<typeof triggerNativeFeedback>[0] | null;
};

type ActiveSwipe = {
	pointerId: number;
	startX: number;
	startY: number;
	startTime: number;
};

/**
 * Pointer-based directional swipe detector. Measures on `pointerup` and never
 * calls `preventDefault`, so native scrolling stays smooth and the gesture only
 * fires on a deliberate flick. Spread the returned handlers onto any element.
 */
export function useSwipe({
	onSwipeLeft,
	onSwipeRight,
	onSwipeUp,
	onSwipeDown,
	threshold = 64,
	restraint = 48,
	maxDurationMs = 700,
	edge,
	edgeSize = 28,
	pointerTypes = ["touch"],
	enabled = true,
	haptic = "selection",
}: Props): SwipeHandlers {
	const activeRef = useRef<ActiveSwipe | null>(null);
	const startTimeRef = useRef(0);

	const onPointerDown = useCallback(
		(event: ReactPointerEvent<HTMLElement>) => {
			if (!enabled || !pointerTypes.includes(event.pointerType)) {
				activeRef.current = null;
				return;
			}
			if (edge === "left" && event.clientX > edgeSize) {
				activeRef.current = null;
				return;
			}
			if (edge === "right" && event.clientX < window.innerWidth - edgeSize) {
				activeRef.current = null;
				return;
			}
			startTimeRef.current = event.timeStamp;
			activeRef.current = {
				pointerId: event.pointerId,
				startX: event.clientX,
				startY: event.clientY,
				startTime: event.timeStamp,
			};
		},
		[edge, edgeSize, enabled, pointerTypes],
	);

	const onPointerMove = useCallback(() => {}, []);

	const reset = useCallback(() => {
		activeRef.current = null;
	}, []);

	const onPointerUp = useCallback(
		(event: ReactPointerEvent<HTMLElement>) => {
			const active = activeRef.current;
			activeRef.current = null;
			if (!active || active.pointerId !== event.pointerId) return;
			if (event.timeStamp - active.startTime > maxDurationMs) return;

			const dx = event.clientX - active.startX;
			const dy = event.clientY - active.startY;
			const absX = Math.abs(dx);
			const absY = Math.abs(dy);

			let fired: SwipeDirection | null = null;
			if (absX > absY) {
				if (absX >= threshold && absY <= restraint) {
					fired = dx > 0 ? "right" : "left";
				}
			} else if (absY >= threshold && absX <= restraint) {
				fired = dy > 0 ? "down" : "up";
			}

			if (!fired) return;

			const handler =
				fired === "left"
					? onSwipeLeft
					: fired === "right"
						? onSwipeRight
						: fired === "up"
							? onSwipeUp
							: onSwipeDown;

			if (!handler) return;
			if (haptic) triggerNativeFeedback(haptic);
			handler();
		},
		[
			haptic,
			maxDurationMs,
			onSwipeDown,
			onSwipeLeft,
			onSwipeRight,
			onSwipeUp,
			restraint,
			threshold,
		],
	);

	return {
		onPointerDown,
		onPointerMove,
		onPointerUp,
		onPointerCancel: reset,
	};
}
