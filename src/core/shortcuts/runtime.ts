import { SHORTCUT_REGISTRY, type ShortcutId } from "./registry";
import type { ShortcutHandlers, ShortcutBindings } from "./types";

export type ShortcutMap = Record<string, { handler: () => void; scope: string }>;

export function buildShortcutMap(
	bindings: ShortcutBindings,
	handlers: ShortcutHandlers,
	activeScopes: string[],
): ShortcutMap {
	const map: ShortcutMap = {};

	for (const [id, meta] of Object.entries(SHORTCUT_REGISTRY) as [
		ShortcutId,
		(typeof SHORTCUT_REGISTRY)[ShortcutId],
	][]) {
		const handler = handlers[id];
		if (!handler) continue;
		if (!activeScopes.includes(meta.scope)) continue;

		const key = bindings[id] ?? meta.key;
		map[key] = { handler, scope: meta.scope };
	}

	return map;
}
