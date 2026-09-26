/**
 * Turns an internal shortcut string like `"mod+shift+k"` into a human-readable
 * label such as `"⌘⇧K"` on Apple platforms or `"Ctrl+Shift+K"` elsewhere.
 *
 * `mod` maps to the platform's primary command modifier (⌘ on Apple, Ctrl
 * otherwise). Unknown tokens are title-cased and passed through untouched.
 */
export function formatShortcut(shortcut: string, isApple = detectApplePlatform()): string {
	const separator = isApple ? "" : "+";

	return shortcut
		.split("+")
		.map((token) => formatToken(token.trim().toLowerCase(), isApple))
		.join(separator);
}

const APPLE_TOKENS: Record<string, string> = {
	mod: "⌘",
	meta: "⌘",
	cmd: "⌘",
	ctrl: "⌃",
	alt: "⌥",
	option: "⌥",
	shift: "⇧",
	enter: "↵",
	backspace: "⌫",
	delete: "⌦",
	escape: "⎋",
	comma: ",",
	slash: "/",
	space: "␣",
};

const OTHER_TOKENS: Record<string, string> = {
	mod: "Ctrl",
	meta: "Ctrl",
	cmd: "Ctrl",
	ctrl: "Ctrl",
	alt: "Alt",
	option: "Alt",
	shift: "Shift",
	enter: "Enter",
	backspace: "Backspace",
	delete: "Delete",
	escape: "Esc",
	comma: ",",
	slash: "/",
	space: "Space",
};

function formatToken(token: string, isApple: boolean): string {
	const map = isApple ? APPLE_TOKENS : OTHER_TOKENS;
	if (token in map) return map[token];
	if (token.length === 1) return token.toUpperCase();
	return token.charAt(0).toUpperCase() + token.slice(1);
}

function detectApplePlatform(): boolean {
	if (typeof navigator === "undefined") return false;
	const platform =
		(navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
			?.platform ??
		navigator.platform ??
		"";
	return /mac|iphone|ipad|ipod/i.test(platform);
}
