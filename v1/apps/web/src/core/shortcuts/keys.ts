import { formatShortcut } from "@remcostoeten/use-shortcut";
import { getModifiersFromEvent } from "@remcostoeten/use-shortcut/parser";

/** Renders one or more combos for display, joining alternatives with " / ". */
export function formatBinding(keys: string | string[]): string {
	const combos = Array.isArray(keys) ? keys : [keys];
	return combos.map((combo) => formatShortcut(combo)).join(" / ");
}

const EVENT_KEY_TOKENS: Record<string, string> = {
	",": "comma",
	"/": "slash",
	".": "period",
	" ": "space",
	Escape: "escape",
	Enter: "enter",
	Backspace: "backspace",
	Delete: "delete",
	ArrowUp: "up",
	ArrowDown: "down",
	ArrowLeft: "left",
	ArrowRight: "right",
};

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);

/**
 * Turns a captured keydown into a library combo string, or `null` when the
 * event is a lone modifier (so a recorder can keep waiting for the real key).
 */
export function eventToCombo(event: KeyboardEvent): string | null {
	if (MODIFIER_KEYS.has(event.key)) return null;

	const modifiers = getModifiersFromEvent(event);
	const tokens: string[] = [];
	if (modifiers.meta || modifiers.ctrl) tokens.push("mod");
	if (modifiers.alt) tokens.push("alt");
	if (modifiers.shift) tokens.push("shift");

	const raw = event.key;
	tokens.push(EVENT_KEY_TOKENS[raw] ?? raw.toLowerCase());

	return tokens.join("+");
}
