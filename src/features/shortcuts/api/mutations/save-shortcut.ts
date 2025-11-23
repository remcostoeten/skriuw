import { create, update, read } from "@/api/storage/crud";
import type { CustomShortcut, CreateCustomShortcutData } from "../types";

const STORAGE_KEY = "quantum-works:shortcuts:custom";

/**
 * Save or update a custom shortcut
 * Uses the generic CRUD layer for agnostic storage
 */
export async function saveShortcut(id: string, keys: string[]): Promise<CustomShortcut> {
	try {
		// Check if shortcut already exists
		const existing = await read<CustomShortcut>(STORAGE_KEY, { getById: id });
		
		if (existing && typeof existing === 'object' && 'id' in existing) {
			// Update existing shortcut
			const updated = await update<CustomShortcut>(STORAGE_KEY, id, {
				keys,
				customizedAt: new Date().toISOString(),
			});
			
			if (!updated) {
				throw new Error('Failed to update shortcut');
			}
			
			return updated;
		} else {
			// Create new shortcut
			const newShortcut = await create<CustomShortcut>(STORAGE_KEY, {
				id,
				keys,
				customizedAt: new Date().toISOString(),
			});
			
			return newShortcut;
		}
	} catch (error) {
		throw new Error(`Failed to save shortcut: ${error instanceof Error ? error.message : String(error)}`);
	}
}
