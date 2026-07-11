/**
 * Primitives for scripting the real editor during a screen-recorded demo.
 *
 * Everything here drives the editor through genuine DOM input events rather
 * than the BlockNote API. BlockNote's suggestion menus (`/`, `@`, `#`, `$`)
 * only open from ProseMirror's `handleTextInput`, which the view invokes for
 * real text input — a programmatic `insertText` transaction inserts the
 * character without ever opening the menu. `execCommand("insertText")` produces
 * the same `beforeinput`/`input` pair a keystroke does, so the menus behave as
 * if a human typed them.
 */

const EDITOR_SELECTORS = ['.bn-editor [contenteditable="true"]', ".ProseMirror"];

export function findEditorElement(): HTMLElement | null {
	for (const selector of EDITOR_SELECTORS) {
		const element = document.querySelector<HTMLElement>(selector);
		if (element) return element;
	}
	return null;
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForEditor(timeoutMs = 10_000): Promise<HTMLElement> {
	const startedAt = performance.now();
	while (performance.now() - startedAt < timeoutMs) {
		const element = findEditorElement();
		if (element) return element;
		await sleep(100);
	}
	throw new Error("Editor never mounted");
}

export function focusEditor(editor: HTMLElement): void {
	editor.focus();
	const selection = window.getSelection();
	if (!selection) return;
	const range = document.createRange();
	range.selectNodeContents(editor);
	range.collapse(false);
	selection.removeAllRanges();
	selection.addRange(range);
}

export async function typeText(text: string, charDelayMs = 55): Promise<void> {
	for (const char of text) {
		document.execCommand("insertText", false, char);
		await sleep(charDelayMs + Math.round(char === " " ? 40 : 0));
	}
}

export async function pressKey(key: string, times = 1): Promise<void> {
	const editor = findEditorElement();
	if (!editor) return;

	for (let index = 0; index < times; index++) {
		for (const type of ["keydown", "keyup"] as const) {
			editor.dispatchEvent(
				new KeyboardEvent(type, { key, bubbles: true, cancelable: true, composed: true }),
			);
		}
		await sleep(120);
	}
}

export async function pressEnter(): Promise<void> {
	await pressKey("Enter");
}
