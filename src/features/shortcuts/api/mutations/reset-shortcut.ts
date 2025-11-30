import { getStorageValue, setStorageValue } from "@/api/storage/simple-storage";

import type { ShortcutId } from "../../shortcut-definitions";

const STORAGE_KEY = "quantum-works:shortcuts:custom";

/**
 * Reset a custom shortcut (delete it)
 */
export async function resetShortcut(id: ShortcutId): Promise<boolean> {
	try {
		const shortcuts = await getStorageValue<Record<ShortcutId, string[]>>(STORAGE_KEY) ?? {};
		delete shortcuts[id];
		await setStorageValue(STORAGE_KEY, shortcuts);
		return true;
	} catch (error) {
		throw new Error(`Failed to reset shortcut: ${error instanceof Error ? error.message : String(error)}`);
	}
}
