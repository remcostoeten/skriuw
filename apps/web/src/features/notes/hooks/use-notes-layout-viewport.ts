"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type Transition, useDragControls, useReducedMotion } from "framer-motion";
import type { PointerEvent as ReactPointerEvent } from "react";
import { EASE_SHEET } from "@/shared/lib/motion";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import { DESKTOP_METADATA_MIN_WIDTH, DESKTOP_SIDEBAR_MIN_WIDTH } from "../constants";

const DESKTOP_SIDEBAR_MAX_WIDTH = 420;
const DESKTOP_METADATA_MAX_WIDTH = 440;
const PANEL_SNAP_CLOSE_RATIO = 0.5;

type ResizePanel = "sidebar" | "metadata";

type ActiveResize = {
	panel: ResizePanel;
	handle: HTMLDivElement | null;
	pointerId: number;
	latestWidth: number;
};

type UseNotesLayoutViewportOptions = {
	isMobile: boolean;
	showSidebar: boolean;
	showMetadata: boolean;
	setUIState: (
		next: Partial<{ isMobile: boolean; showSidebar: boolean; showMetadata: boolean }>,
	) => void;
	setSidebarWidth: (width: number) => void;
	setMetadataWidth: (width: number) => void;
};

export function useNotesLayoutViewport({
	isMobile,
	showSidebar,
	showMetadata,
	setUIState,
	setSidebarWidth,
	setMetadataWidth,
}: UseNotesLayoutViewportOptions) {
	const prefersReducedMotion = useReducedMotion();
	const metadataDragControls = useDragControls();
	const [activeResizePanel, setActiveResizePanel] = useState<ResizePanel | null>(null);
	const activeResizeRef = useRef<ActiveResize | null>(null);
	const resizeFrameRef = useRef<number | null>(null);
	const sidebarRef = useRef<HTMLDivElement>(null);
	const metadataRef = useRef<HTMLDivElement>(null);

	const closeSidebar = useCallback(() => {
		triggerNativeFeedback("dismiss");
		setUIState({ showSidebar: false });
	}, [setUIState]);

	const closeMetadata = useCallback(() => {
		triggerNativeFeedback("dismiss");
		setUIState({ showMetadata: false });
	}, [setUIState]);

	const startDesktopPanelResize = useCallback(
		(panel: ResizePanel) => (event: ReactPointerEvent<HTMLDivElement>) => {
			if (isMobile) return;
			const handle = event.currentTarget;
			const initialWidth =
				panel === "sidebar"
					? (sidebarRef.current?.getBoundingClientRect().width ??
						DESKTOP_SIDEBAR_MIN_WIDTH)
					: (metadataRef.current?.getBoundingClientRect().width ??
						DESKTOP_METADATA_MIN_WIDTH);

			activeResizeRef.current = {
				panel,
				handle,
				pointerId: event.pointerId,
				latestWidth: initialWidth,
			};
			setActiveResizePanel(panel);
			handle.setPointerCapture(event.pointerId);
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
			event.preventDefault();
		},
		[isMobile],
	);

	const handleDesktopSidebarResizeStart = startDesktopPanelResize("sidebar");
	const handleDesktopMetadataResizeStart = startDesktopPanelResize("metadata");

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
		const resetResizeInteraction = (activeResize: ActiveResize) => {
			activeResizeRef.current = null;
			setActiveResizePanel(null);
			if (resizeFrameRef.current !== null) {
				cancelAnimationFrame(resizeFrameRef.current);
				resizeFrameRef.current = null;
			}
			document.body.style.cursor = "";
			document.body.style.userSelect = "";

			if (activeResize.handle?.hasPointerCapture(activeResize.pointerId)) {
				activeResize.handle.releasePointerCapture(activeResize.pointerId);
			}
		};

		const closeResizedPanel = (activeResize: ActiveResize, minWidth: number) => {
			resetResizeInteraction(activeResize);
			triggerNativeFeedback("dismiss");
			setUIState(
				activeResize.panel === "sidebar" ? { showSidebar: false } : { showMetadata: false },
			);
			window.setTimeout(
				() => {
					if (activeResize.panel === "sidebar") {
						setSidebarWidth(minWidth);
					} else {
						setMetadataWidth(minWidth);
					}
				},
				prefersReducedMotion ? 120 : 220,
			);
		};

		const stopResizing = () => {
			const activeResize = activeResizeRef.current;
			if (!activeResize) return;
			resetResizeInteraction(activeResize);
			const { panel, latestWidth } = activeResize;
			const minWidth =
				panel === "sidebar" ? DESKTOP_SIDEBAR_MIN_WIDTH : DESKTOP_METADATA_MIN_WIDTH;

			if (latestWidth < minWidth) {
				if (panel === "sidebar") {
					setSidebarWidth(minWidth);
				} else {
					setMetadataWidth(minWidth);
				}
			}
		};

		const handlePointerMove = (event: PointerEvent) => {
			const activeResize = activeResizeRef.current;
			if (!activeResize) return;
			if (resizeFrameRef.current !== null) return;

			const pointerX = event.clientX;
			resizeFrameRef.current = requestAnimationFrame(() => {
				resizeFrameRef.current = null;
				const activeResize = activeResizeRef.current;
				if (!activeResize) return;

				if (activeResize.panel === "sidebar") {
					if (!sidebarRef.current) return;
					const { left } = sidebarRef.current.getBoundingClientRect();
					const nextWidth = Math.min(
						DESKTOP_SIDEBAR_MAX_WIDTH,
						Math.max(0, pointerX - left),
					);
					activeResize.latestWidth = nextWidth;
					setSidebarWidth(nextWidth);
					if (nextWidth <= DESKTOP_SIDEBAR_MIN_WIDTH * PANEL_SNAP_CLOSE_RATIO) {
						closeResizedPanel(activeResize, DESKTOP_SIDEBAR_MIN_WIDTH);
					}
					return;
				}

				if (!metadataRef.current) return;
				const { right } = metadataRef.current.getBoundingClientRect();
				const nextWidth = Math.min(
					DESKTOP_METADATA_MAX_WIDTH,
					Math.max(0, right - pointerX),
				);
				activeResize.latestWidth = nextWidth;
				setMetadataWidth(nextWidth);
				if (nextWidth <= DESKTOP_METADATA_MIN_WIDTH * PANEL_SNAP_CLOSE_RATIO) {
					closeResizedPanel(activeResize, DESKTOP_METADATA_MIN_WIDTH);
				}
			});
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
	}, [prefersReducedMotion, setMetadataWidth, setSidebarWidth, setUIState]);

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
		metadataRef,
		closeSidebar,
		closeMetadata,
		handleDesktopSidebarResizeStart,
		handleDesktopMetadataResizeStart,
		overlayTransition,
		sidebarTransition,
		metadataTransition,
		isSidebarResizing: activeResizePanel === "sidebar",
		isMetadataResizing: activeResizePanel === "metadata",
	};
}
