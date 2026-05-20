import { SHORTCUT_REGISTRY, type ShortcutId } from "./registry";
import type { ShortcutBindings } from "./types";

const STORAGE_KEY = "shortcut-bindings";

export function loadBindings(): ShortcutBindings {
	const defaults = Object.fromEntries(
		Object.entries(SHORTCUT_REGISTRY).map(([id, meta]) => [id, meta.key]),
	) as ShortcutBindings;

	if (typeof window === "undefined") return defaults;

	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return defaults;

		const parsed = JSON.parse(stored);

		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return defaults;
		}

		const sanitized: Partial<ShortcutBindings> = {};
		for (const [id, value] of Object.entries(parsed)) {
			if (!(id in defaults)) continue;
			if (typeof value !== "string") continue;
			sanitized[id as ShortcutId] = value;
		}

		return { ...defaults, ...sanitized };
	} catch {
		return defaults;
	}
}

export function saveBindings(bindings: ShortcutBindings): void {
	if (typeof window === "undefined") return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
	} catch {
		// best-effort persistence; keep in-memory bindings
	}
}
