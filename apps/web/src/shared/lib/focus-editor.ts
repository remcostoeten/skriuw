function caretRangeFromPoint(x: number, y: number): Range | null {
	const doc = document as Document & {
		caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
		caretRangeFromPoint?: (x: number, y: number) => Range | null;
	};
	if (typeof doc.caretPositionFromPoint === "function") {
		const position = doc.caretPositionFromPoint(x, y);
		if (!position) return null;
		const range = document.createRange();
		range.setStart(position.offsetNode, position.offset);
		range.collapse(true);
		return range;
	}
	if (typeof doc.caretRangeFromPoint === "function") {
		return doc.caretRangeFromPoint(x, y);
	}
	return null;
}

function findScrollContainer(element: HTMLElement): HTMLElement | null {
	let node = element.parentElement;
	while (node) {
		const { overflowY } = getComputedStyle(node);
		if (overflowY === "auto" || overflowY === "scroll") return node;
		node = node.parentElement;
	}
	return null;
}

/**
 * Drops the caret at the document end, but only if that end is already in
 * view. On a long note the end sits far below the fold, so focusing it would
 * yank the view to the bottom and hide the fact that the editor is now focused —
 * instead the caret lands on whatever line is currently visible, keeping it in
 * sight. `preventScroll` stops the browser from jumping the viewport either way.
 *
 * "In view" is the intersection of the element, its scrollable ancestor, and
 * the window — the editor scrolls inside an inner container, so window-based
 * math alone would probe points behind the app chrome above it. If the caret
 * still ends up outside that band (e.g. every probe missed a text position),
 * it is scrolled into view as a last resort so it is never invisible.
 */
function placeCaretInView(element: HTMLElement): void {
	element.focus({ preventScroll: true });
	const selection = window.getSelection();
	if (!selection) return;

	const endRange = document.createRange();
	endRange.selectNodeContents(element);
	endRange.collapse(false);

	const bounds = element.getBoundingClientRect();
	const containerBounds = findScrollContainer(element)?.getBoundingClientRect();
	const viewportBottom = window.innerHeight || document.documentElement.clientHeight;
	const visibleTop = Math.max(bounds.top, containerBounds?.top ?? 0, 0);
	const visibleBottom = Math.min(
		bounds.bottom,
		containerBounds?.bottom ?? viewportBottom,
		viewportBottom,
	);

	const endRect = endRange.getBoundingClientRect();
	const endInView = endRect.top >= visibleTop && endRect.bottom <= visibleBottom;

	let range = endRange;
	if (!endInView) {
		const x = bounds.left + Math.min(bounds.width / 2, 24);
		for (let y = visibleTop + 24; y < visibleBottom; y += 24) {
			const pointRange = caretRangeFromPoint(x, y);
			if (pointRange && element.contains(pointRange.startContainer)) {
				range = pointRange;
				break;
			}
		}
	}

	selection.removeAllRanges();
	selection.addRange(range);
	scrollCaretIntoView(selection, visibleTop, visibleBottom);
}

function scrollCaretIntoView(selection: Selection, visibleTop: number, visibleBottom: number): void {
	if (selection.rangeCount === 0) return;
	const range = selection.getRangeAt(0);
	const rect = range.getBoundingClientRect();
	const hasRect = rect.top !== 0 || rect.bottom !== 0 || rect.left !== 0 || rect.right !== 0;
	if (hasRect && rect.top >= visibleTop && rect.bottom <= visibleBottom) return;

	const node = range.startContainer;
	const target = node instanceof HTMLElement ? node : node.parentElement;
	target?.scrollIntoView({ block: "nearest" });
}

function focusPlainTextarea(plain: HTMLTextAreaElement): void {
	const lineHeight = Number.parseFloat(getComputedStyle(plain).lineHeight) || 20;
	const firstVisibleLine = Math.floor(plain.scrollTop / lineHeight);
	const lines = plain.value.split("\n");
	const scrolledPastTop = plain.scrollTop > lineHeight;

	plain.focus({ preventScroll: true });

	if (!scrolledPastTop) {
		const end = plain.value.length;
		plain.setSelectionRange(end, end);
		return;
	}

	let offset = 0;
	for (let i = 0; i < firstVisibleLine && i < lines.length; i++) {
		offset += lines[i].length + 1;
	}
	offset = Math.min(offset, plain.value.length);
	plain.setSelectionRange(offset, offset);
}

function focusEditorWithin(root: ParentNode): boolean {
	const rich = root.querySelector<HTMLElement>(".blocknote-wrapper [contenteditable='true']");
	if (rich) {
		placeCaretInView(rich);
		return true;
	}

	const plain = root.querySelector<HTMLTextAreaElement>("[data-editor-surface]");
	if (plain) {
		focusPlainTextarea(plain);
		return true;
	}

	return false;
}

/**
 * Focuses the active writing surface, dropping the caret on the currently
 * visible line (or the document end when that end is already in view) so a long
 * note never scrolls out from under the user. Handles both editor modes: the
 * BlockNote rich editor (a ProseMirror `contenteditable` inside
 * `.blocknote-wrapper`) and the plain-markdown `textarea` (tagged with
 * `data-editor-surface`). Returns `false` when no editor is mounted, so callers
 * can no-op (e.g. the journal list view before an entry is open).
 */
export function focusActiveEditor(): boolean {
	if (typeof document === "undefined") return false;

	return focusEditorWithin(document);
}

export function focusSplitEditorPane(pane: "primary" | "secondary"): boolean {
	if (typeof document === "undefined") return false;

	const paneRoot = document.querySelector<HTMLElement>(`[data-editor-pane="${pane}"]`);
	return paneRoot ? focusEditorWithin(paneRoot) : false;
}

/**
 * Asks the mounted file tree to reveal and focus a note. The tree is
 * virtualized, so a DOM query alone misses rows that are scrolled out of the
 * window or hidden inside a collapsed folder — the FileList listener expands
 * ancestors, scrolls the virtualizer, and moves its roving focus, then cancels
 * the event to signal it took over.
 */
export const NOTE_TREE_REVEAL_EVENT = "skriuw:reveal-note-tree-item";

export type NoteTreeRevealDetail = { fileId: string };

export function focusActiveNoteTreeItem(targetFileId?: string): boolean {
	if (typeof document === "undefined") return false;

	if (targetFileId) {
		const revealHandled = !window.dispatchEvent(
			new CustomEvent<NoteTreeRevealDetail>(NOTE_TREE_REVEAL_EVENT, {
				detail: { fileId: targetFileId },
				cancelable: true,
			}),
		);
		if (revealHandled) return true;

		const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(targetFileId) : targetFileId;
		const targetItem = document.querySelector<HTMLElement>(
			`[data-note-tree-item-id="${escaped}"]`,
		);
		if (targetItem) {
			targetItem.focus();
			return true;
		}
	}

	const activeTreeItem = document.querySelector<HTMLElement>(
		'[data-active-note-tree-item="true"]',
	);
	if (activeTreeItem) {
		activeTreeItem.focus();
		return true;
	}

	const focusedTreeItem = document.querySelector<HTMLElement>(
		'[aria-label="Notes file tree"] [role="treeitem"][tabindex="0"]',
	);
	if (focusedTreeItem) {
		focusedTreeItem.focus();
		return true;
	}

	const tree = document.querySelector<HTMLElement>('[aria-label="Notes file tree"]');
	tree?.focus();
	return Boolean(tree);
}
