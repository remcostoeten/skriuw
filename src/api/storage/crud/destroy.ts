import { getGenericStorage } from "../generic-storage-factory";

export interface DestroyOptions {
	recursive?: boolean;
}

/**
 * Generic destroy/delete function that works with any entity type
 * Uses the generic storage adapter for agnostic storage
 */
export async function destroy(storageKey: string, id: string, options?: DestroyOptions): Promise<boolean> {
        try {
                const storage = getGenericStorage();
                const success = await storage.delete(storageKey, id);
                return success;
	} catch (error) {
		throw new Error(`Failed to delete entity ${id} from ${storageKey}: ${error instanceof Error ? error.message : String(error)}`);
	}
}
