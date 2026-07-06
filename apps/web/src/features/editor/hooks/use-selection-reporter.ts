import { useEffect, type RefObject } from "react";

type CursorChange = (position: {
	line: number;
	column: number;
	selection?: { words: number; characters: number };
}) => void;

type Params = {
	editorDom: HTMLElement | null;
	wrapperRef: RefObject<HTMLDivElement | null>;
	onCursorChange?: CursorChange;
};

export function useSelectionReporter({ editorDom, wrapperRef, onCursorChange }: Params) {
	useEffect(() => {
		if (!onCursorChange) return;
		const root = wrapperRef.current ?? editorDom;
		if (!root) return;

		let animationFrame: number | null = null;
		let suppressUntil = 0;

		const clearSelectionStatus = () => {
			onCursorChange({ line: 1, column: 1 });
		};

		const reportSelection = () => {
			const selection = document.getSelection();
			if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
				clearSelectionStatus();
				return;
			}

			const range = selection.getRangeAt(0);
			if (!root.contains(range.commonAncestorContainer)) {
				clearSelectionStatus();
				return;
			}

			const selectedText = selection.toString();
			if (!selectedText) {
				clearSelectionStatus();
				return;
			}

			const trimmed = selectedText.trim();
			onCursorChange({
				line: 1,
				column: 1,
				selection: {
					words: trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0,
					characters: selectedText.length,
				},
			});
		};

		const queueSelectionReport = (event?: Event) => {
			// Right-click opens the context menu; reporting the selection here forces
			// a re-render of the parent (EditorContainer) while Radix is still
			// measuring/positioning the freshly-opened menu, which can dismiss it or
			// throw its position off. Suppress both the triggering pointerdown and
			// the selectionchange it causes (the browser collapses the caret to the
			// click point before the contextmenu event fires).
			if (event instanceof PointerEvent && event.button === 2) {
				suppressUntil = window.performance.now() + 200;
				return;
			}

			if (window.performance.now() < suppressUntil) {
				return;
			}

			if (animationFrame !== null) {
				window.cancelAnimationFrame(animationFrame);
			}

			animationFrame = window.requestAnimationFrame(() => {
				animationFrame = null;
				reportSelection();
			});
		};

		document.addEventListener("selectionchange", queueSelectionReport);
		document.addEventListener("pointerup", queueSelectionReport);
		root.addEventListener("blur", queueSelectionReport, true);
		root.addEventListener("focusout", queueSelectionReport);
		root.addEventListener("keyup", queueSelectionReport);
		root.addEventListener("pointerdown", queueSelectionReport);
		root.addEventListener("pointerup", queueSelectionReport);
		return () => {
			if (animationFrame !== null) {
				window.cancelAnimationFrame(animationFrame);
			}

			document.removeEventListener("selectionchange", queueSelectionReport);
			document.removeEventListener("pointerup", queueSelectionReport);
			root.removeEventListener("blur", queueSelectionReport, true);
			root.removeEventListener("focusout", queueSelectionReport);
			root.removeEventListener("keyup", queueSelectionReport);
			root.removeEventListener("pointerdown", queueSelectionReport);
			root.removeEventListener("pointerup", queueSelectionReport);
		};
	}, [editorDom, wrapperRef, onCursorChange]);
}
