import { getStorageValue } from "@/api/storage/simple-storage";

import type { ShortcutId, KeyCombo } from "../../shortcut-definitions";

const STORAGE_KEY = "quantum-works:shortcuts:custom";

/**
 * Get all custom shortcuts as a record
 */
export async function getShortcuts(): Promise<Record<ShortcutId, KeyCombo[]>> {
	try {
		const data = await getStorageValue<Record<ShortcutId, KeyCombo[]>>(STORAGE_KEY);
		return data ?? {};
	} catch (error) {
		throw new Error(`Failed to get shortcuts: ${error instanceof Error ? error.message : String(error)}`);
	}
}
