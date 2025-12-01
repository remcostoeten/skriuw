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
		if (typeof window !== 'undefined' && import.meta.env?.DEV && !options?.getAll) {
			try {
				const { devEventTracker } = await import('../../../../next-app/shared/dev/dev-event-tracker');
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
			} catch {
				// Ignore if dev-event-tracker is not available
			}
		}
		
		return result;
	} catch (error) {
		// Log error to dev tracker
		if (typeof window !== 'undefined' && import.meta.env?.DEV) {
			try {
				const { devEventTracker } = await import('../../../../next-app/shared/dev/dev-event-tracker');
				devEventTracker.log({
					type: 'query',
					operation: 'read',
					storageKey,
					error: error instanceof Error ? error.message : String(error)
				});
			} catch {
				// Ignore if dev-event-tracker is not available
			}
		}
		
		throw new Error(`Failed to read from ${storageKey}: ${error instanceof Error ? error.message : String(error)}`);
	}
}
