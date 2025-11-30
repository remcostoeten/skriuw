import { initializeAppStorage } from "@/app/storage";
import { getDb } from "@/data/drizzle/client";
import { notes, folders } from "@/data/drizzle/base-entities";


/**
 * Remove all data from storage
 * This clears all notes and folders from the database
 */
export async function removeAllStorage(): Promise<void> {
	try {
		const db = await getDb();
		
		// Delete all notes
		await db.delete(notes);
		
		// Delete all folders
		await db.delete(folders);
		
		// Clear localStorage keys if in browser
		if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
			const rawKeys = [
				'skriuw_editor_tabs_state',
				'Skriuw_expanded_folders',
			];
			
			for (const key of rawKeys) {
				localStorage.removeItem(key);
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
        await initializeAppStorage();
        // initializeDefaultNotesAndFolders is called by initializeAppStorage
	} catch (error) {
        throw new Error(
            `Failed to restart storage: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

