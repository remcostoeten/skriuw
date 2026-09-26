export type KeySequenceMatch = "exact" | "prefix" | "none";

export function normalizeKeybind(keybind: string): string {
	return keybind.trim().toLowerCase();
}

export function matchKeySequence(buffer: string, keybind: string): KeySequenceMatch {
	if (buffer === keybind) return "exact";
	if (keybind.startsWith(buffer)) return "prefix";
	return "none";
}

/**
 * Extracts the next go-to-mode input character from a keydown. Returns `null`
 * for anything that isn't a plain printable key — lone modifiers, modified
 * combos (ctrl+…), and navigation keys are ignored rather than treated as a
 * failed match, so holding a modifier doesn't kick the user out of the mode.
 */
/**
 * Whether a shortcut combo includes a real modifier (mod/ctrl/alt). Shift
 * alone doesn't count — shift+letter is ordinary typing (capital letters).
 * Required for the activation shortcut when it may fire inside the editor.
 */
export function comboHasModifier(combo: string): boolean {
	const tokens = combo.toLowerCase().split("+");
	return tokens.includes("mod") || tokens.includes("ctrl") || tokens.includes("alt");
}

/** Whether the event originated from a typing surface (input or editor). */
export function isTypingContext(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	const tag = target.tagName;
	return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function keyFromEvent(event: KeyboardEvent): string | null {
	if (event.ctrlKey || event.metaKey || event.altKey) return null;
	if (event.key.length !== 1) return null;
	if (event.key === " ") return null;
	return event.key.toLowerCase();
}
