import { getStorageValue } from "@/api/storage/simple-storage";

import type { ShortcutId, KeyCombo } from "../../shortcut-definitions";
import type { CustomShortcut } from "../types";

const STORAGE_KEY = "quantum-works:shortcuts:custom";

/**
 * Get a single custom shortcut by ID
 */
export async function getShortcut(id: ShortcutId): Promise<CustomShortcut | undefined> {
	try {
		const shortcuts = await getStorageValue<Record<ShortcutId, KeyCombo[]>>(STORAGE_KEY);
		if (shortcuts && shortcuts[id]) {
			return {
				id,
				keys: shortcuts[id],
				createdAt: Date.now(),
				updatedAt: Date.now()
			};
		}
		return undefined;
	} catch (error) {
		throw new Error(`Failed to get shortcut: ${error instanceof Error ? error.message : String(error)}`);
	}
}
