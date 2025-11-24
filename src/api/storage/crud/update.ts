import {
        getItemById,
        NOTE_STORAGE_KEY,
        renameItemRecord,
        updateNoteRecord
} from "@/data/drizzle/data-access";

import { getGenericStorage } from "../generic-storage-factory";

import type { BaseEntity } from "../generic-types";

export interface UpdateOptions {
	merge?: boolean;
}

/**
 * Generic update function that works with any entity type
 * Uses the generic storage adapter for agnostic storage
 */
export async function update<T extends BaseEntity>(
	storageKey: string,
	id: string,
	data: Partial<T>,
	options?: UpdateOptions
): Promise<T | undefined> {
        try {
                if (storageKey === NOTE_STORAGE_KEY) {
                        const existing = await getItemById(id);
                        if (!existing) return undefined;

                        if (existing.type === 'note') {
                                return (await updateNoteRecord(id, {
                                        name: (data as any).name,
                                        content: (data as any).content,
                                        parentFolderId: (data as any).parentFolderId ?? existing.parentFolderId ?? null
                                })) as T | undefined;
                        }

                        if ((data as any).name) {
                                return (await renameItemRecord(id, (data as any).name)) as T | undefined;
                        }

                        return existing as T;
                }

                const storage = getGenericStorage();
		
		const result = await storage.update<T>(storageKey, id, data);
		return result;
	} catch (error) {
		throw new Error(`Failed to update entity ${id} in ${storageKey}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

