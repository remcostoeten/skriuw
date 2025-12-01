import { getGenericStorage } from "../generic-storage-factory";

import type { BaseEntity, ReadOptions as GenericReadOptions } from "../generic-types";

export interface ReadOptions<T extends BaseEntity = BaseEntity> {
        getById?: string;
        filter?: (item: T) => boolean;
        sort?: (a: T, b: T) => number;
        getAll?: boolean;
}

/**
 * Generic read function that works with any entity type
 * Uses the generic storage adapter for agnostic storage
 */
export async function read<T extends BaseEntity>(
	storageKey: string,
	options?: ReadOptions<T>
): Promise<T[] | T | undefined> {
        try {
                const storage = getGenericStorage();

                const genericOptions: GenericReadOptions = {
                        getById: options?.getById,
                        filter: options?.filter as GenericReadOptions['filter'],
                        sort: options?.sort as GenericReadOptions['sort'],
                        getAll: options?.getAll
                }

		const result = await storage.read<T>(storageKey, genericOptions);
		
		// Log to dev tracker (only for non-getAll queries to avoid spam)
		if (import.meta.env.DEV && !options?.getAll) {
			const { devEventTracker } = await import('@/shared/dev/dev-event-tracker');
			const resultCount = Array.isArray(result) ? result.length : result ? 1 : 0;
			devEventTracker.log({
				type: 'query',
				operation: 'read',
				storageKey,
				data: { 
					getById: options?.getById,
					resultCount 
				}
			});
		}
		
		return result;
	} catch (error) {
		// Log error to dev tracker
		if (import.meta.env.DEV) {
			const { devEventTracker } = await import('@/shared/dev/dev-event-tracker');
			devEventTracker.log({
				type: 'query',
				operation: 'read',
				storageKey,
				error: error instanceof Error ? error.message : String(error)
			});
		}
		
		throw new Error(`Failed to read from ${storageKey}: ${error instanceof Error ? error.message : String(error)}`);
	}
}
