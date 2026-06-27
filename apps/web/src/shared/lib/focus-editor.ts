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

/**
 * Focuses the active writing surface and drops the caret at its end. Handles
 * both editor modes: the BlockNote rich editor (a ProseMirror `contenteditable`
 * inside `.blocknote-wrapper`) and the plain-markdown `textarea` (tagged with
 * `data-editor-surface`). Returns `false` when no editor is mounted, so callers
 * can no-op (e.g. the journal list view before an entry is open).
 */
export function focusActiveEditor(): boolean {
	if (typeof document === "undefined") return false;

	const rich = document.querySelector<HTMLElement>(
		".blocknote-wrapper [contenteditable='true']",
	);
	if (rich) {
		placeCaretAtEnd(rich);
		return true;
	}

	const plain = document.querySelector<HTMLTextAreaElement>("[data-editor-surface]");
	if (plain) {
		plain.focus();
		const end = plain.value.length;
		plain.setSelectionRange(end, end);
		return true;
	}

	return false;
}
