import { NOTE_STORAGE_KEY, moveItemRecord } from "@/data/drizzle/data-access";

import { getGenericStorage } from "../generic-storage-factory";

/**
 * Generic move function that works with any entity type
 * Moves an entity to a different parent (for nested structures)
 */
export async function move(
        storageKey: string,
        entityId: string,
        targetParentId: string | null
): Promise<boolean> {
        try {
                if (storageKey === NOTE_STORAGE_KEY) {
                        return moveItemRecord(entityId, targetParentId);
                }

                const storage = getGenericStorage();
                const success = await storage.move(storageKey, entityId, targetParentId);
                return success;
	} catch (error) {
		throw new Error(`Failed to move entity ${entityId} in ${storageKey}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

