import { initializeAppStorage } from "@/app/storage";
import { getStorageConfig } from "@/app/storage/config";

import { initializeDefaultNotesAndFolders } from "@/features/notes/utils/initialize-defaults";

import { destroy } from "@/api/storage/crud/destroy";
import { read } from "@/api/storage/crud/read";

import { getStorageKeys } from "./queries/get-storage-keys";

import type { BaseEntity } from "@/api/storage/generic-types";

/**
 * Remove all data from storage
 * This clears all storage keys but keeps the storage adapter configuration
 */
export async function removeAllStorage(): Promise<void> {
	try {
		const keys = await getStorageKeys();
		
		// Delete all items from all storage keys
		for (const storageKey of keys) {
			try {
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

        // Get current storage config
        const config = getStorageConfig();

        // Re-initialize storage with defaults
        if (config) {
            await initializeAppStorage(config);
            // initializeDefaultNotesAndFolders is called by initializeAppStorage
		} else {
			// If no config, just initialize defaults on current storage
			await initializeDefaultNotesAndFolders();
		}
	} catch (error) {
        throw new Error(
            `Failed to restart storage: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

