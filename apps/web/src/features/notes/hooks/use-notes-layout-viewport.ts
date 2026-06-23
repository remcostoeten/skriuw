"use client";

import { useCallback, useEffect, useRef } from "react";
import { type Transition, useDragControls, useReducedMotion } from "framer-motion";
import type { PointerEvent as ReactPointerEvent } from "react";
import { EASE_SHEET } from "@/shared/lib/motion";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import { DESKTOP_SIDEBAR_MIN_WIDTH } from "../constants";

const DESKTOP_SIDEBAR_MAX_WIDTH = 420;
const SHEET_DISMISS_VELOCITY = 480;

type UseNotesLayoutViewportOptions = {
	isMobile: boolean;
	showSidebar: boolean;
	showMetadata: boolean;
	setUIState: (next: Partial<{ isMobile: boolean; showSidebar: boolean; showMetadata: boolean }>) => void;
	setSidebarWidth: (width: number) => void;
};

export function useNotesLayoutViewport({
	isMobile,
	showSidebar,
	showMetadata,
	setUIState,
	setSidebarWidth,
}: UseNotesLayoutViewportOptions) {
	const prefersReducedMotion = useReducedMotion();
	const metadataDragControls = useDragControls();
	const sidebarResizeActiveRef = useRef(false);
	const sidebarRef = useRef<HTMLDivElement>(null);

	const closeSidebar = useCallback(() => {
		triggerNativeFeedback("dismiss");
		setUIState({ showSidebar: false });
	}, [setUIState]);

	const closeMetadata = useCallback(() => {
		triggerNativeFeedback("dismiss");
		setUIState({ showMetadata: false });
	}, [setUIState]);

	const handleDesktopSidebarResizeStart = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			if (isMobile) return;
			sidebarResizeActiveRef.current = true;
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
			event.preventDefault();
		},
		[isMobile],
	);

	useEffect(() => {
		const mediaQuery = window.matchMedia("(max-width: 767px)");
		const syncViewport = (event?: MediaQueryListEvent) => {
			const mobile = event?.matches ?? mediaQuery.matches;
			setUIState({
				isMobile: mobile,
				showSidebar: !mobile,
				showMetadata: !mobile,
			});
		};

		syncViewport();
		mediaQuery.addEventListener("change", syncViewport);

		return () => mediaQuery.removeEventListener("change", syncViewport);
	}, [setUIState]);

	useEffect(() => {
		if (!isMobile) return;

		const hasOverlayOpen = showSidebar || showMetadata;
		document.body.style.overflow = hasOverlayOpen ? "hidden" : "";

		return () => {
			document.body.style.overflow = "";
		};
	}, [isMobile, showSidebar, showMetadata]);

	useEffect(() => {
		const stopResizing = () => {
			if (!sidebarResizeActiveRef.current) return;
			sidebarResizeActiveRef.current = false;
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};

		const handlePointerMove = (event: PointerEvent) => {
			if (!sidebarResizeActiveRef.current || !sidebarRef.current) return;

			const { left } = sidebarRef.current.getBoundingClientRect();
			const nextWidth = Math.min(
				DESKTOP_SIDEBAR_MAX_WIDTH,
				Math.max(DESKTOP_SIDEBAR_MIN_WIDTH, event.clientX - left),
			);

			setSidebarWidth(nextWidth);
		};

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", stopResizing);
		window.addEventListener("pointercancel", stopResizing);

		return () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", stopResizing);
			window.removeEventListener("pointercancel", stopResizing);
			stopResizing();
		};
	}, [setSidebarWidth]);

	const overlayTransition: Transition = prefersReducedMotion
		? { duration: 0.12, ease: "linear" }
		: { duration: 0.2, ease: "easeOut" };

	const sidebarTransition: Transition = prefersReducedMotion
		? { duration: 0.16, ease: "easeOut" }
		: { duration: 0.5, ease: EASE_SHEET };

	const metadataTransition: Transition = prefersReducedMotion
		? { duration: 0.16, ease: "easeOut" }
		: { duration: 0.5, ease: EASE_SHEET };

	return {
		prefersReducedMotion: Boolean(prefersReducedMotion),
		metadataDragControls,
		sidebarRef,
		closeSidebar,
		closeMetadata,
		handleDesktopSidebarResizeStart,
		overlayTransition,
		sidebarTransition,
		metadataTransition,
	};
}
