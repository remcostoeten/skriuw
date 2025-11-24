import { createFolderRecord, createNoteRecord, NOTE_STORAGE_KEY } from "@/data/drizzle/data-access";

import { getGenericStorage } from "../generic-storage-factory";

import type { BaseEntity } from "../generic-types";

export interface CreateOptions {
	generateId?: () => string;
}

/**
 * Generic create function that works with any entity type
 * Uses the generic storage adapter for agnostic storage
 */
export async function create<T extends BaseEntity>(
        storageKey: string,
        data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
        options?: CreateOptions
): Promise<T> {
        try {
                if (storageKey === NOTE_STORAGE_KEY) {
                        const payload = data as any;

                        if (payload.type === 'folder') {
                                return await createFolderRecord({
                                        name: payload.name,
                                        parentFolderId: payload.parentFolderId
                                }) as T;
                        }

                        return await createNoteRecord({
                                name: payload.name,
                                content: payload.content,
                                parentFolderId: payload.parentFolderId
                        }) as T;
                }

                const storage = getGenericStorage();
		
		// Generate ID if not provided
		if (!data.id && options?.generateId) {
			data.id = options.generateId();
		}

		const result = await storage.create<T>(storageKey, data);
		return result;
	} catch (error) {
		throw new Error(`Failed to create entity in ${storageKey}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

