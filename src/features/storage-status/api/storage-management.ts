import { initializeAppStorage } from "@/app/storage";

import { initializeDefaultNotesAndFolders } from "@/features/notes/utils/initialize-defaults";

import { destroy } from "@/api/storage/crud/destroy";
import { read } from "@/api/storage/crud/read";

import { getStorageKeys } from "./queries/get-storage-keys";

import type { BaseEntity } from "@/api/storage/generic-types";

/**
 * Raw localStorage keys that should be preserved (not deleted)
 */
const PRESERVED_KEYS = [] as const;

/**
 * Check if a key should be preserved during reset
 */
function shouldPreserveKey(key: string): boolean {
	return PRESERVED_KEYS.includes(key as typeof PRESERVED_KEYS[number]);
}

/**
 * Remove all data from storage
 * This clears all storage keys but keeps the storage adapter configuration
 */
export async function removeAllStorage(): Promise<void> {
	try {
		const keys = await getStorageKeys();
		
		// Delete all items from all storage keys
		for (const storageKey of keys) {
			// Skip preserved keys
			if (shouldPreserveKey(storageKey)) {
				continue;
			}

			try {
				// For raw localStorage keys, clear them directly
				if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
					// Check if it's a raw localStorage key (not managed by generic storage)
					const rawKeys = [
						'skriuw_editor_tabs_state',
						'Skriuw_expanded_folders',
					];
					
					if (rawKeys.includes(storageKey)) {
						localStorage.removeItem(storageKey);
						continue;
					}
				}

				// For generic storage keys, delete all items
				const items = await read<BaseEntity>(storageKey);
				const itemsArray = Array.isArray(items) ? items : items ? [items] : [];
				
				// Delete each item
				await Promise.all(
					itemsArray.map(item => destroy(storageKey, item.id))
				);
			} catch (error) {
				console.warn(`Failed to clear storage key ${storageKey}:`, error);
				// Continue with other keys even if one fails
			}
		}
	} catch (error) {
		throw new Error(
			`Failed to remove all storage: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

/**
 * Restart storage - clears all data and re-initializes with defaults
 * This is useful for resetting the app to a fresh state
 */
export async function restartStorage(): Promise<void> {
    try {
        // First, remove all existing data
        await removeAllStorage();

        // Re-initialize storage with defaults
        // initializeDefaultNotesAndFolders is called by initializeAppStorage
        await initializeAppStorage();
	} catch (error) {
        throw new Error(
            `Failed to restart storage: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

