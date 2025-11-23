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

