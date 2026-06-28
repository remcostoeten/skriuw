function placeCaretAtEnd(element: HTMLElement): void {
	element.focus();
	const selection = window.getSelection();
	if (!selection) return;
	const range = document.createRange();
	range.selectNodeContents(element);
	range.collapse(false);
	selection.removeAllRanges();
	selection.addRange(range);
}

function focusEditorWithin(root: ParentNode): boolean {
	const rich = root.querySelector<HTMLElement>(".blocknote-wrapper [contenteditable='true']");
	if (rich) {
		placeCaretAtEnd(rich);
		return true;
	}

	const plain = root.querySelector<HTMLTextAreaElement>("[data-editor-surface]");
	if (plain) {
		plain.focus();
		const end = plain.value.length;
		plain.setSelectionRange(end, end);
		return true;
	}

	return false;
}

/**
 * Focuses the active writing surface and drops the caret at its end. Handles
 * both editor modes: the BlockNote rich editor (a ProseMirror `contenteditable`
 * inside `.blocknote-wrapper`) and the plain-markdown `textarea` (tagged with
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

export function focusActiveNoteTreeItem(): boolean {
	if (typeof document === "undefined") return false;

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
