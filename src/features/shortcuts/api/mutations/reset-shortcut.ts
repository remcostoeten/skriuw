import { destroy } from "@/api/storage/crud";

import type { ShortcutId } from "../../shortcut-definitions";

const STORAGE_KEY = "quantum-works:shortcuts:custom";

/**
 * Reset a custom shortcut (delete it)
 * Uses the generic CRUD layer for agnostic storage
 */
export async function resetShortcut(id: ShortcutId): Promise<boolean> {
	try {
		return await destroy(STORAGE_KEY, id);
	} catch (error) {
		throw new Error(`Failed to reset shortcut: ${error instanceof Error ? error.message : String(error)}`);
	}
}
