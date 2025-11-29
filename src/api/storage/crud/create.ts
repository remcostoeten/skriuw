import { getGenericStorage } from "../generic-storage-factory";

import type { BaseEntity } from "../generic-types";

export interface CreateOptions {
	merge?: boolean;
}

/**
 * Generic create function that works with any entity type
 * Uses the generic storage adapter for agnostic storage
 */
export async function create<T extends BaseEntity>(
	storageKey: string,
	data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<T> {
        try {
                const storage = getGenericStorage();
		const result = await storage.create<T>(storageKey, data);
		return result;
	} catch (error) {
		throw new Error(`Failed to create entity in ${storageKey}: ${error instanceof Error ? error.message : String(error)}`);
	}
}