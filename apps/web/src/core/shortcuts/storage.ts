import { SHORTCUT_REGISTRY, type ShortcutId } from "./registry";
import type { ShortcutBindings } from "./types";
import { noop } from "@/shared/lib/noop";

const STORAGE_KEY = "shortcut-bindings";

function isKnownId(id: string): id is ShortcutId {
	return id in SHORTCUT_REGISTRY;
}

export function loadBindings(): ShortcutBindings {
	if (typeof window === "undefined") return {};

	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return {};

		const parsed = JSON.parse(stored);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {};
		}

		const sanitized: ShortcutBindings = {};
		for (const [id, value] of Object.entries(parsed)) {
			if (!isKnownId(id)) continue;
			if (typeof value !== "string" || value.trim().length === 0) continue;
			sanitized[id] = value;
		}
		return sanitized;
	} catch {
		return {};
	}
}

export function saveBindings(bindings: ShortcutBindings): void {
	if (typeof window === "undefined") return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
	} catch {
		// best-effort persistence; keep in-memory bindings
		noop();
	}
}
