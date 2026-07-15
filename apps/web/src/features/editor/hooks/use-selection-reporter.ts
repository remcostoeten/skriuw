import { useEffect, type RefObject } from "react";

const WHITESPACE_PATTERN = /\s/;

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

		let reportTimeout: ReturnType<typeof setTimeout> | null = null;
		let suppressUntil = 0;
		const REPORT_DELAY_MS = 120;

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

			let words = 0;
			let insideWord = false;
			for (let index = 0; index < selectedText.length; index += 1) {
				const isWhitespace = WHITESPACE_PATTERN.test(selectedText[index]);
				if (!isWhitespace && !insideWord) words += 1;
				insideWord = !isWhitespace;
			}
			onCursorChange({
				line: 1,
				column: 1,
				selection: {
					words,
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

			if (reportTimeout !== null) {
				clearTimeout(reportTimeout);
			}

			// Selection painting is latency-sensitive and can already be expensive for
			// a large ProseMirror document. Count only after drag-selection / Ctrl+A
			// settles instead of scanning the selected text in the same frame.
			reportTimeout = setTimeout(() => {
				reportTimeout = null;
				reportSelection();
			}, REPORT_DELAY_MS);
		};

		document.addEventListener("selectionchange", queueSelectionReport);
		root.addEventListener("pointerdown", queueSelectionReport);
		return () => {
			if (reportTimeout !== null) {
				clearTimeout(reportTimeout);
			}

			document.removeEventListener("selectionchange", queueSelectionReport);
			root.removeEventListener("pointerdown", queueSelectionReport);
		};
	}, [editorDom, wrapperRef, onCursorChange]);
}
