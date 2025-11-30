import { getStorageValue, setStorageValue } from "@/api/storage/simple-storage";

import type { ShortcutId, KeyCombo } from "../../shortcut-definitions";
import type { CustomShortcut } from "../types";

const STORAGE_KEY = "quantum-works:shortcuts:custom";

/**
 * Save or update a custom shortcut
 */
export async function saveShortcut(id: string, keys: string[]): Promise<CustomShortcut> {
	try {
		const shortcuts = await getStorageValue<Record<ShortcutId, KeyCombo[]>>(STORAGE_KEY) ?? {};
		shortcuts[id as ShortcutId] = keys;
		await setStorageValue(STORAGE_KEY, shortcuts);
		
		return {
			id,
			keys,
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
	} catch (error) {
		throw new Error(`Failed to save shortcut: ${error instanceof Error ? error.message : String(error)}`);
	}
}
