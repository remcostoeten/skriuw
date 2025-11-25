import { read } from "@/api/storage/crud";

import type { ShortcutId } from "../../shortcut-definitions";
import type { CustomShortcut } from "../types";

const STORAGE_KEY = "quantum-works:shortcuts:custom";

/**
 * Get a single custom shortcut by ID
 * Uses the generic CRUD layer for agnostic storage
 */
export async function getShortcut(id: ShortcutId): Promise<CustomShortcut | undefined> {
	try {
		const shortcut = await read<CustomShortcut>(STORAGE_KEY, { getById: id });
		
		if (shortcut && typeof shortcut === 'object' && 'id' in shortcut) {
			return shortcut;
		}
		
		return undefined;
	} catch (error) {
		throw new Error(`Failed to get shortcut: ${error instanceof Error ? error.message : String(error)}`);
	}
}
